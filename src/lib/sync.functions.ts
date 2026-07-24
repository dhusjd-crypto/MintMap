import { createServerFn } from "@tanstack/react-start";

type D1Result = { meta?: { changes?: number } };
type D1Statement = { bind: (...values: unknown[]) => D1Statement; run: () => Promise<D1Result>; first: <T>() => Promise<T | null> };
type D1Database = { prepare: (query: string) => D1Statement };
type SyncRow = { revision: number; payload: string; updated_at: number };
type SyncRecord = Record<string, unknown>;
type SyncSnapshot = { version: 1; mindmap: { workspaces: SyncRecord[]; currentId?: string }; keep: SyncRecord[] };

function db(): D1Database | undefined {
  const runtime = globalThis as typeof globalThis & {
    __env__?: { MINTMAP_SYNC?: D1Database };
    __mintmapWorkerBindings?: { MINTMAP_SYNC?: D1Database };
  };
  // Nitro's Cloudflare adapter exposes the authoritative request bindings as
  // __env__. Keep the custom entry fallback for older generated worker builds.
  return runtime.__env__?.MINTMAP_SYNC ?? runtime.__mintmapWorkerBindings?.MINTMAP_SYNC;
}

function asRecord(value: unknown): SyncRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as SyncRecord : null;
}

function asRecords(value: unknown): SyncRecord[] {
  return Array.isArray(value) ? value.map(asRecord).filter((item): item is SyncRecord => !!item) : [];
}

function timestamp(value: SyncRecord) {
  return typeof value.updatedAt === "number"
    ? value.updatedAt
    : typeof value.createdAt === "number"
      ? value.createdAt
      : 0;
}

function newest(remote: SyncRecord, incoming: SyncRecord) {
  return timestamp(incoming) > timestamp(remote) ? incoming : remote;
}

function mergeById(remote: SyncRecord[], incoming: SyncRecord[], merge?: (remote: SyncRecord, incoming: SyncRecord) => SyncRecord) {
  const incomingById = new Map(incoming.filter((item) => typeof item.id === "string").map((item) => [item.id as string, item]));
  const merged = remote.map((item) => {
    const id = typeof item.id === "string" ? item.id : "";
    const other = incomingById.get(id);
    incomingById.delete(id);
    return other ? (merge ? merge(item, other) : newest(item, other)) : item;
  });
  return [...merged, ...incomingById.values()];
}

function mergeTask(remote: SyncRecord, incoming: SyncRecord) {
  const winner = newest(remote, incoming);
  const other = winner === remote ? incoming : remote;
  return {
    ...winner,
    activity: mergeById(asRecords(remote.activity), asRecords(incoming.activity)),
    attachments: mergeById(asRecords(remote.attachments), asRecords(incoming.attachments)),
    tags: [...new Set([...((winner.tags as string[] | undefined) ?? []), ...((other.tags as string[] | undefined) ?? [])])],
  };
}

function mergeNode(remote: SyncRecord, incoming: SyncRecord) {
  const winner = newest(remote, incoming);
  const other = winner === remote ? incoming : remote;
  return {
    ...winner,
    todos: mergeById(asRecords(remote.todos), asRecords(incoming.todos), mergeTask),
    files: mergeById(asRecords(remote.files), asRecords(incoming.files)),
    images: mergeById(asRecords(remote.images), asRecords(incoming.images)),
    links: [...new Set([...((winner.links as string[] | undefined) ?? []), ...((other.links as string[] | undefined) ?? [])])],
    tags: [...new Set([...((winner.tags as string[] | undefined) ?? []), ...((other.tags as string[] | undefined) ?? [])])],
  };
}

function workspaceKey(workspace: SyncRecord) {
  return typeof workspace.name === "string" ? workspace.name.trim().toLocaleLowerCase("tr-TR") : "";
}

function mergeWorkspace(remote: SyncRecord, incoming: SyncRecord) {
  return {
    ...remote,
    // The existing cloud workspace id is canonical for all devices.
    nodes: mergeById(asRecords(remote.nodes), asRecords(incoming.nodes), mergeNode),
  };
}

/**
 * The database is the last line of defence against stale PWAs. Older clients
 * could upload an entire local snapshot after another device added a node.
 * Merge on the server so a missing item is never interpreted as a deletion.
 */
function mergeServerSnapshots(remotePayload: string, incomingPayload: string): string {
  try {
    const remote = JSON.parse(remotePayload) as SyncSnapshot;
    const incoming = JSON.parse(incomingPayload) as SyncSnapshot;
    if (remote?.version !== 1 || incoming?.version !== 1) return incomingPayload;
    const incomingById = new Map(asRecords(incoming.mindmap?.workspaces).filter((item) => typeof item.id === "string").map((item) => [item.id as string, item]));
    const mergedWorkspaces = asRecords(remote.mindmap?.workspaces).map((workspace) => {
      const id = typeof workspace.id === "string" ? workspace.id : "";
      let other = incomingById.get(id);
      incomingById.delete(id);
      if (!other) {
        const name = workspaceKey(workspace);
        const byName = [...incomingById.entries()].find(([, candidate]) => workspaceKey(candidate) === name);
        if (byName) {
          incomingById.delete(byName[0]);
          other = byName[1];
        }
      }
      return other ? mergeWorkspace(workspace, other) : workspace;
    });
    const merged: SyncSnapshot = {
      version: 1,
      mindmap: { workspaces: [...mergedWorkspaces, ...incomingById.values()], currentId: remote.mindmap?.currentId },
      keep: mergeById(asRecords(remote.keep), asRecords(incoming.keep)),
    };
    return JSON.stringify(merged);
  } catch {
    return incomingPayload;
  }
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
    const current = await database
      .prepare("SELECT revision, payload, updated_at FROM sync_documents WHERE id = ?")
      .bind("personal")
      .first<SyncRow>();
    const payload = current ? mergeServerSnapshots(current.payload, data.payload) : data.payload;
    const result = current
      ? await database
          .prepare("UPDATE sync_documents SET revision = revision + 1, payload = ?, updated_at = ? WHERE id = ? AND revision = ?")
          .bind(payload, now, "personal", data.baseRevision)
          .run()
      : await database
          .prepare("INSERT INTO sync_documents (id, revision, payload, updated_at) VALUES (?, 1, ?, ?)")
          .bind("personal", payload, now)
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
