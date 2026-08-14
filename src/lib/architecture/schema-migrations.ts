export type MigrationContext = {
  backup?: () => Promise<void>;
};

export type Migration<T> = {
  version: number;
  name: string;
  up(data: T): T | Promise<T>;
};

export type MigrationResult<T> = {
  data: T;
  fromVersion: number;
  toVersion: number;
  appliedVersions: number[];
};

export class MigrationError extends Error {
  constructor(
    message: string,
    readonly failedVersion: number,
    readonly appliedVersions: number[],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "MigrationError";
  }
}

/**
 * Pure migration runner contract. It does not read/write production storage
 * and therefore cannot accidentally migrate a user's current snapshot.
 */
export async function runMigrations<T>(
  data: T,
  currentVersion: number,
  migrations: readonly Migration<T>[],
  context: MigrationContext = {},
): Promise<MigrationResult<T>> {
  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  const seen = new Set<number>();
  for (const migration of ordered) {
    if (migration.version <= 0 || seen.has(migration.version)) {
      throw new Error(`Geçersiz veya yinelenen migration sürümü: ${migration.version}`);
    }
    seen.add(migration.version);
  }

  const pending = ordered.filter((migration) => migration.version > currentVersion);
  if (!pending.length) {
    return { data, fromVersion: currentVersion, toVersion: currentVersion, appliedVersions: [] };
  }

  await context.backup?.();
  let next = data;
  const appliedVersions: number[] = [];
  for (const migration of pending) {
    try {
      next = await migration.up(next);
      appliedVersions.push(migration.version);
    } catch (error) {
      throw new MigrationError(
        `Migration ${migration.version} (${migration.name}) başarısız oldu.`,
        migration.version,
        appliedVersions,
        { cause: error },
      );
    }
  }

  return {
    data: next,
    fromVersion: currentVersion,
    toVersion: pending[pending.length - 1].version,
    appliedVersions,
  };
}
