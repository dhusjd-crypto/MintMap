import { createServerFn } from "@tanstack/react-start";

type D1Result = { meta?: { changes?: number } };
type D1Statement = { bind: (...values: unknown[]) => D1Statement; run: () => Promise<D1Result>; first: <T>() => Promise<T | null> };
type D1Database = { prepare: (query: string) => D1Statement };
type SyncRow = { revision: number; payload: string; updated_at: number };

function db(): D1Database | undefined {
  const runtime = globalThis as typeof globalThis & {
    __env__?: { MINTMAP_SYNC?: D1Database };
    __mintmapWorkerBindings?: { MINTMAP_SYNC?: D1Database };
  };
  // Nitro's Cloudflare adapter exposes the authoritative request bindings as
  // __env__. Keep the custom entry fallback for older generated worker builds.
  return runtime.__env__?.MINTMAP_SYNC ?? runtime.__mintmapWorkerBindings?.MINTMAP_SYNC;
}

export const pullCloudSnapshot = createServerFn({ method: "GET" })
  .handler(async () => {
    const database = db();
    if (!database) return { enabled: false as const };
    const row = await database
      .prepare("SELECT revision, payload, updated_at FROM sync_documents WHERE id = ?")
      .bind("personal")
      .first<SyncRow>();
    return row
      ? { enabled: true as const, revision: row.revision, payload: row.payload, updatedAt: row.updated_at }
      : { enabled: true as const, revision: 0, payload: null, updatedAt: null };
  });

export const pushCloudSnapshot = createServerFn({ method: "POST" })
  .inputValidator((data: { baseRevision?: number; payload?: string }) => {
    if (!Number.isInteger(data?.baseRevision) || data.baseRevision! < 0) throw new Error("Geçersiz eşitleme sürümü");
    if (!data.payload || data.payload.length > 4_500_000) throw new Error("Eşitleme verisi çok büyük");
    return { baseRevision: data.baseRevision!, payload: data.payload };
  })
  .handler(async ({ data }) => {
    const database = db();
    if (!database) return { enabled: false as const };
    const now = Date.now();
    const result = await database
      .prepare(
        "INSERT INTO sync_documents (id, revision, payload, updated_at) VALUES (?, 1, ?, ?) " +
          "ON CONFLICT(id) DO UPDATE SET revision = sync_documents.revision + 1, payload = excluded.payload, updated_at = excluded.updated_at " +
          "WHERE sync_documents.revision = ?",
      )
      .bind("personal", data.payload, now, data.baseRevision)
      .run();
    const row = await database
      .prepare("SELECT revision, payload, updated_at FROM sync_documents WHERE id = ?")
      .bind("personal")
      .first<SyncRow>();
    if (!row) throw new Error("Eşitleme kaydı okunamadı");
    return {
      enabled: true as const,
      accepted: (result.meta?.changes ?? 0) > 0,
      revision: row.revision,
      payload: row.payload,
      updatedAt: row.updated_at,
    };
  });
