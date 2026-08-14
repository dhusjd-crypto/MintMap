import { createBackup, type BackupStore } from "./backup";
import { canonicalStorage } from "./storage";
import {
  CANONICAL_SCHEMA_VERSION,
  CanonicalPersistenceError,
  type CanonicalStorage,
} from "./types";

export type MigrationJournalStatus =
  "PLANNED" | "PREPARING" | "BACKUP_CREATED" | "RUNNING" | "VALIDATING" | "COMPLETED" | "FAILED";
export type MigrationJournalEntry = {
  id: string;
  fromVersion: number;
  toVersion: number;
  description: string;
  status: MigrationJournalStatus;
  startedAt: number;
  completedAt?: number;
  backupReference?: string;
  failure?: { code: string; message: string };
};
export type CanonicalMigration = {
  id: string;
  fromVersion: number;
  toVersion: number;
  description: string;
  prepare?: () => Promise<void>;
  up: (context: { storage: CanonicalStorage }) => Promise<void>;
  validate: (context: { storage: CanonicalStorage }) => Promise<void>;
};

async function writeJournal(storage: CanonicalStorage, entry: MigrationJournalEntry) {
  await storage.put("migration_journal", {
    id: entry.id,
    entityType: "MigrationJournal",
    schemaVersion: 1,
    revision: 1,
    createdAt: entry.startedAt,
    updatedAt: Date.now(),
    payload: entry,
  });
}

export class CanonicalRecoveryRequiredError extends Error {
  constructor(
    readonly migrationId: string,
    message: string,
  ) {
    super(message);
    this.name = "CanonicalRecoveryRequiredError";
  }
}

export async function initializeCanonicalPersistence(
  options: {
    storage?: CanonicalStorage;
    migrations?: CanonicalMigration[];
    backupStore?: BackupStore;
  } = {},
) {
  const storage = options.storage ?? canonicalStorage;
  const meta = await storage.get<{ schemaVersion: number }>("meta", "canonical-schema");
  let version =
    meta?.payload.schemaVersion ?? (options.migrations?.length ? 0 : CANONICAL_SCHEMA_VERSION);
  const failed = (await storage.list<MigrationJournalEntry>("migration_journal")).find(
    (entry) => entry.payload.status === "FAILED",
  );
  if (failed)
    throw new CanonicalRecoveryRequiredError(
      failed.id,
      "Önceki canonical migration başarısız oldu; veri korunarak kurtarma bekleniyor.",
    );
  if (!meta)
    await storage.put("meta", {
      id: "canonical-schema",
      entityType: "CanonicalSchema",
      schemaVersion: CANONICAL_SCHEMA_VERSION,
      revision: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      payload: { schemaVersion: version },
    });
  for (const migration of [...(options.migrations ?? [])].sort(
    (a, b) => a.fromVersion - b.fromVersion,
  )) {
    if (migration.fromVersion < version) continue;
    if (migration.fromVersion !== version)
      throw new CanonicalPersistenceError(
        `Canonical migration yolu ${version} sürümünde kesiliyor.`,
        "SCHEMA_MISMATCH",
      );
    const entry: MigrationJournalEntry = {
      id: migration.id,
      fromVersion: migration.fromVersion,
      toVersion: migration.toVersion,
      description: migration.description,
      status: "PLANNED",
      startedAt: Date.now(),
    };
    try {
      entry.status = "PREPARING";
      await writeJournal(storage, entry);
      await migration.prepare?.();
      entry.status = "BACKUP_CREATED";
      const backup = await createBackup(storage, options.backupStore);
      entry.backupReference = backup.manifest.backupId;
      await writeJournal(storage, entry);
      entry.status = "RUNNING";
      await writeJournal(storage, entry);
      await migration.up({ storage });
      entry.status = "VALIDATING";
      await writeJournal(storage, entry);
      await migration.validate({ storage });
      version = migration.toVersion;
      await storage.put("meta", {
        id: "canonical-schema",
        entityType: "CanonicalSchema",
        schemaVersion: CANONICAL_SCHEMA_VERSION,
        revision: (meta?.revision ?? 0) + 1,
        createdAt: meta?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        payload: { schemaVersion: version },
      });
      entry.status = "COMPLETED";
      entry.completedAt = Date.now();
      await writeJournal(storage, entry);
    } catch (error) {
      entry.status = "FAILED";
      entry.failure = {
        code: error instanceof CanonicalPersistenceError ? error.code : "MIGRATION_FAILED",
        message: error instanceof Error ? error.message : String(error),
      };
      await writeJournal(storage, entry);
      throw new CanonicalRecoveryRequiredError(migration.id, entry.failure.message);
    }
  }
  return { schemaVersion: version, healthy: true as const };
}
