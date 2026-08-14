import { describe, expect, it } from "vitest";
import { createFinanceApplication } from "@/application/finance/finance-application";
import {
  createFinanceCaptureImportApplication,
  matchImportRow,
  parseCsvRows,
} from "@/application/finance/capture-import";
import { fixedClock } from "@/lib/architecture/clock";
import { createFinancePersistence } from "@/lib/canonical-persistence/repositories";
import { InMemoryCanonicalStorage } from "@/lib/canonical-persistence/storage";

const clock = fixedClock(Date.parse("2026-08-14T09:00:00Z"));
describe("Finance capture, import and reconciliation", () => {
  it("parses Turkish CSV money and explains exact external-id duplicates", () => {
    const rows = parseCsvRows(
      "Tarih;Tutar;Açıklama;ID\n14.08.2026;-1.250,50;Market;abc",
      {
        date: "Tarih",
        amount: "Tutar",
        description: "Açıklama",
        externalId: "ID",
        dateFormat: "DD.MM.YYYY",
      },
      "TRY",
    );
    expect(rows[0].warnings).toEqual([]);
    const matches = matchImportRow(
      { ...rows[0], externalId: "abc" },
      [
        {
          id: "tx",
          accountId: "a",
          amount: { minorUnits: -125050, currency: "TRY" },
          date: rows[0].date!,
          description: "Market",
          metadata: { externalId: "abc" },
        },
      ],
      "a",
    );
    expect(matches[0]).toMatchObject({
      confidence: "EXACT",
      reasonCodes: expect.arrayContaining(["EXACT_EXTERNAL_ID"]),
    });
  });
  it("requires review before statement truth and blocks unbalanced reconciliation", async () => {
    const persistence = createFinancePersistence(new InMemoryCanonicalStorage());
    const finance = createFinanceApplication({ persistence, clock });
    const app = createFinanceCaptureImportApplication({ persistence, clock });
    const book = await finance.commands.createBook({
      name: "Kişisel",
      type: "PERSONAL",
      baseCurrency: "TRY",
    });
    const account = await finance.commands.createAccount({
      financeBookId: book.id,
      name: "Banka",
      type: "BANK",
      currency: "TRY",
    });
    const tx = await finance.commands.createTransaction({
      financeBookId: book.id,
      accountId: account.id,
      date: clock.nowMs(),
      amount: { minorUnits: 10000, currency: "TRY" },
      intent: "INCOME",
    });
    const session = await app.commands.startReconciliation({
      financeBookId: book.id,
      accountId: account.id,
      closingBalance: { minorUnits: 20000, currency: "TRY" },
      transactionIds: [tx.id],
    });
    await expect(app.commands.completeReconciliation(session.id)).rejects.toThrow(
      "RECONCILIATION_DIFFERENCE",
    );
  });
});
