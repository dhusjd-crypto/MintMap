import { describe, expect, it } from "vitest";
import { createMoney } from "@/domain/finance/money";
import { createFinancePersistence } from "@/lib/canonical-persistence/repositories";
import { InMemoryCanonicalStorage } from "@/lib/canonical-persistence/storage";
import { CaptureRepository } from "@/application/repositories/capture-repository";
import {
  createBackup,
  InMemoryBackupStore,
  retainBackups,
  restoreBackup,
  validateBackup,
} from "@/lib/canonical-persistence/backup";
import { initializeCanonicalPersistence } from "@/lib/canonical-persistence/migrations";

function book(id: string, type: "PERSONAL" | "BUSINESS" = "PERSONAL") {
  return {
    id,
    name: id,
    type,
    baseCurrency: "TRY" as const,
    createdAt: 1,
    updatedAt: 1,
    metadata: {},
  };
}

function account(id: string, financeBookId: string) {
  return {
    id,
    financeBookId,
    name: id,
    type: "BANK" as const,
    role: "ASSET" as const,
    currency: "TRY" as const,
    createdAt: 1,
    updatedAt: 1,
    metadata: {},
  };
}

describe("canonical local persistence", () => {
  it("round-trips exact finance money and keeps personal/business scoped queries isolated", async () => {
    const storage = new InMemoryCanonicalStorage();
    const finance = createFinancePersistence(storage);
    await finance.saveBook(book("personal"));
    await finance.saveBook(book("business", "BUSINESS"));
    await finance.saveAccount(account("personal-account", "personal"));
    await finance.saveAccount(account("business-account", "business"));
    await finance.saveTransaction({
      id: "tx-personal",
      financeBookId: "personal",
      accountId: "personal-account",
      date: 1,
      createdAt: 1,
      updatedAt: 1,
      amount: createMoney(8745037, "TRY"),
      status: "CLEARED",
      metadata: { futureField: "preserved" },
    });
    await finance.saveTransaction({
      id: "tx-business",
      financeBookId: "business",
      accountId: "business-account",
      date: 1,
      createdAt: 1,
      updatedAt: 1,
      amount: createMoney(-125, "TRY"),
      status: "UNCLEARED",
      metadata: {},
    });

    const personal = await finance.listTransactions("personal");
    expect(personal).toHaveLength(1);
    expect(personal[0].amount).toEqual({ minorUnits: 8745037, currency: "TRY" });
    expect(personal[0].metadata.futureField).toBe("preserved");
    expect(await finance.listAccounts("business")).toHaveLength(1);
    await expect(finance.saveAccount(account("orphan", "missing"))).rejects.toThrow("FinanceBook");
  });

  it("creates, validates, and restores a versioned backup without changing IDs", async () => {
    const storage = new InMemoryCanonicalStorage();
    const backups = new InMemoryBackupStore();
    const finance = createFinancePersistence(storage);
    await finance.saveBook(book("personal"));
    const created = await createBackup(storage, backups);
    expect((await validateBackup(created)).valid).toBe(true);
    await storage.remove("finance_books", "personal");
    expect(await storage.get("finance_books", "personal")).toBeUndefined();
    await restoreBackup(created, storage, { restoreLegacy: false });
    expect((await storage.get<{ name: string }>("finance_books", "personal"))?.payload.name).toBe(
      "personal",
    );
    expect(await backups.list()).toHaveLength(1);
  });

  it("includes Capture document bytes in backup validation and restore", async () => {
    const storage = new InMemoryCanonicalStorage();
    const captures = new CaptureRepository(storage);
    await captures.saveDocumentContent({
      id: "capture-document",
      documentRefId: "capture-document",
      blob: new Blob(["yerel ocr kanıtı"], { type: "text/plain" }),
      createdAt: 1,
    });
    const backup = await createBackup(storage, new InMemoryBackupStore());
    expect((await validateBackup(backup)).valid).toBe(true);
    await storage.remove("capture_document_content", "capture-document");
    await restoreBackup(backup, storage, { restoreLegacy: false });
    expect(await (await captures.getDocumentContent("capture-document"))?.blob.text()).toBe(
      "yerel ocr kanıtı",
    );
  });

  it("runs migrations once and blocks startup after a failed migration", async () => {
    const storage = new InMemoryCanonicalStorage();
    const backups = new InMemoryBackupStore();
    let runs = 0;
    const migration = {
      id: "canonical-v1",
      fromVersion: 0,
      toVersion: 1,
      description: "initial",
      up: async () => {
        runs += 1;
      },
      validate: async () => undefined,
    };
    expect(
      (
        await initializeCanonicalPersistence({
          storage,
          migrations: [migration],
          backupStore: backups,
        })
      ).schemaVersion,
    ).toBe(1);
    await initializeCanonicalPersistence({
      storage,
      migrations: [migration],
      backupStore: backups,
    });
    expect(runs).toBe(1);

    const failingStorage = new InMemoryCanonicalStorage();
    const failing = {
      ...migration,
      id: "failing",
      up: async () => {
        throw new Error("fixture failure");
      },
    };
    await expect(
      initializeCanonicalPersistence({
        storage: failingStorage,
        migrations: [failing],
        backupStore: new InMemoryBackupStore(),
      }),
    ).rejects.toThrow("fixture failure");
    expect((await failingStorage.list("migration_journal"))[0].payload.status).toBe("FAILED");
    await expect(
      initializeCanonicalPersistence({
        storage: failingStorage,
        migrations: [failing],
        backupStore: new InMemoryBackupStore(),
      }),
    ).rejects.toThrow("kurtarma");
  });

  it("keeps valid finance records readable when a malformed envelope is present", async () => {
    const storage = new InMemoryCanonicalStorage();
    const finance = createFinancePersistence(storage);
    await finance.saveBook(book("valid"));
    await storage.put("finance_books", {
      id: "bad",
      entityType: "WrongType",
      schemaVersion: 1,
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      payload: null as never,
    });
    expect((await finance.repositories.books.list()).map((value) => value.id)).toEqual(["valid"]);
    expect(
      (await storage.list("persistence_operations")).some(
        (entry) => entry.payload.status === "QUARANTINED",
      ),
    ).toBe(true);
  });

  it("does not prefer an invalid backup over a valid backup during retention", async () => {
    const storage = new InMemoryCanonicalStorage();
    const backups = new InMemoryBackupStore();
    const valid = await createBackup(storage, backups);
    const invalid = structuredClone(valid);
    invalid.manifest.backupId = "invalid-newer";
    invalid.manifest.createdAt = valid.manifest.createdAt + 1000;
    invalid.manifest.checksum = "corrupt";
    await backups.save(invalid);

    const retained = await retainBackups(1, backups);
    expect(retained).toHaveLength(1);
    expect(retained[0].manifest.backupId).toBe(valid.manifest.backupId);
    expect(await backups.get("invalid-newer")).toBeUndefined();
  });
});
