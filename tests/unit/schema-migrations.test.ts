import { describe, expect, it, vi } from "vitest";
import { MigrationError, runMigrations } from "../../src/lib/architecture/schema-migrations";

describe("schema migration contract", () => {
  it("orders pending migrations and runs the backup hook once", async () => {
    const order: number[] = [];
    const backup = vi.fn(async () => undefined);
    const result = await runMigrations(
      0,
      0,
      [
        {
          version: 2,
          name: "second",
          up: (value) => {
            order.push(2);
            return value + 1;
          },
        },
        {
          version: 1,
          name: "first",
          up: (value) => {
            order.push(1);
            return value + 1;
          },
        },
      ],
      { backup },
    );
    expect(result.data).toBe(2);
    expect(result.appliedVersions).toEqual([1, 2]);
    expect(order).toEqual([1, 2]);
    expect(backup).toHaveBeenCalledTimes(1);
  });

  it("is run-once for a version that has already been applied", async () => {
    const migration = vi.fn((value: number) => value + 1);
    const result = await runMigrations(5, 1, [{ version: 1, name: "done", up: migration }]);
    expect(result.data).toBe(5);
    expect(migration).not.toHaveBeenCalled();
  });

  it("reports failure and applied versions without claiming partial success", async () => {
    await expect(
      runMigrations(0, 0, [
        { version: 1, name: "ok", up: (value) => value + 1 },
        {
          version: 2,
          name: "bad",
          up: () => {
            throw new Error("bad fixture");
          },
        },
      ]),
    ).rejects.toMatchObject<Partial<MigrationError>>({
      failedVersion: 2,
      appliedVersions: [1],
    });
  });
});
