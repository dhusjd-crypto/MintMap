import { useEffect } from "react";
import { keep, type KeepCard } from "./keep-store";
import { mindmap, type MindNode, type StoreShape, type Todo, type Workspace } from "./mindmap-store";
import { pullCloudSnapshot, pushCloudSnapshot } from "./sync.functions";
import { repairTextTree } from "./text-normalize";

type CloudSnapshot = {
  version: 1;
  mindmap: StoreShape;
  keep: KeepCard[];
  deletedKeepIds?: Record<string, number>;
};
const DEBOUNCE_MS = 2_500;
const POLL_MS = 30_000;

function changedAt(value: { updatedAt?: number; createdAt?: number }) {
  return value.updatedAt ?? value.createdAt ?? 0;
}

function latest<T>(left: T, right: T): T {
  return changedAt(right as { updatedAt?: number; createdAt?: number }) > changedAt(left as { updatedAt?: number; createdAt?: number }) ? right : left;
}

function unionById<T extends { id: string; updatedAt?: number; createdAt?: number }>(local: T[], remote: T[]) {
  const remoteById = new Map(remote.map((item) => [item.id, item]));
  const result = local.map((item) => {
    const other = remoteById.get(item.id);
    remoteById.delete(item.id);
    return other ? latest(item, other) : item;
  });
  return [...result, ...remoteById.values()];
}

function mergeTodo(local: Todo, remote: Todo, deletedEntryIds: Record<string, number>): Todo {
  const winner = latest(local, remote);
  const other = winner === local ? remote : local;
  return {
    ...winner,
    // Child structures are append-safe. Their completion changes still follow
    // the most recently edited task record above.
    activity: unionById(winner.activity ?? [], other.activity ?? []).filter((entry) => !deletedEntryIds[entry.id]),
    attachments: unionById(winner.attachments ?? [], other.attachments ?? []).filter((file) => !deletedEntryIds[file.id]),
    tags: [...new Set([...(winner.tags ?? []), ...(other.tags ?? [])])],
  };
}

function mergeNode(local: MindNode, remote: MindNode, deletedEntryIds: Record<string, number>): MindNode {
  const winner = latest(local, remote);
  const other = winner === local ? remote : local;
  const remoteTodos = new Map(remote.todos.map((todo) => [todo.id, todo]));
  const todos = local.todos.map((todo) => {
    const fromRemote = remoteTodos.get(todo.id);
    remoteTodos.delete(todo.id);
    return fromRemote ? mergeTodo(todo, fromRemote, deletedEntryIds) : todo;
  });
  return {
    ...winner,
    todos: [...todos, ...remoteTodos.values()],
    links: [...new Set([...(winner.links ?? []), ...(other.links ?? [])])],
    tags: [...new Set([...(winner.tags ?? []), ...(other.tags ?? [])])],
    files: unionById(winner.files ?? [], other.files ?? []).filter((file) => !deletedEntryIds[file.id]),
    images: unionById(winner.images ?? [], other.images ?? []).filter((image) => !deletedEntryIds[image.id]),
  };
}

function mergeWorkspace(local: Workspace, remote: Workspace): Workspace {
  const deletedNodeIds = { ...(remote.deletedNodeIds ?? {}), ...(local.deletedNodeIds ?? {}) };
  for (const [id, at] of Object.entries(remote.deletedNodeIds ?? {})) {
    deletedNodeIds[id] = Math.max(at, deletedNodeIds[id] ?? 0);
  }
  for (const [id, at] of Object.entries(local.deletedNodeIds ?? {})) {
    deletedNodeIds[id] = Math.max(at, deletedNodeIds[id] ?? 0);
  }
  const deletedTodoIds = { ...(remote.deletedTodoIds ?? {}), ...(local.deletedTodoIds ?? {}) };
  for (const [id, at] of Object.entries(remote.deletedTodoIds ?? {})) {
    deletedTodoIds[id] = Math.max(at, deletedTodoIds[id] ?? 0);
  }
  for (const [id, at] of Object.entries(local.deletedTodoIds ?? {})) {
    deletedTodoIds[id] = Math.max(at, deletedTodoIds[id] ?? 0);
  }
  const deletedEntryIds = { ...(remote.deletedEntryIds ?? {}), ...(local.deletedEntryIds ?? {}) };
  for (const [id, at] of Object.entries(remote.deletedEntryIds ?? {})) {
    deletedEntryIds[id] = Math.max(at, deletedEntryIds[id] ?? 0);
  }
  for (const [id, at] of Object.entries(local.deletedEntryIds ?? {})) {
    deletedEntryIds[id] = Math.max(at, deletedEntryIds[id] ?? 0);
  }
  const localById = new Map(local.nodes.map((node) => [node.id, node]));
  const nodes = remote.nodes.map((node) => {
    const current = localById.get(node.id);
    localById.delete(node.id);
    const merged = current ? mergeNode(current, node, deletedEntryIds) : node;
    return {
      ...merged,
      files: (merged.files ?? []).filter((file) => !deletedEntryIds[file.id]),
      images: (merged.images ?? []).filter((image) => !deletedEntryIds[image.id]),
      todos: merged.todos.filter((todo) => !deletedTodoIds[todo.id]),
    };
  });
  // The cloud copy is the canonical workspace identity. Older installs made
  // workspace ids independently on every device, so retaining a local id here
  // would keep the same named workspace split forever.
  return {
    ...latest(local, remote),
    id: remote.id,
    deletedNodeIds,
    deletedTodoIds,
    deletedEntryIds,
    nodes: [...nodes, ...localById.values()]
      .filter((node) => !deletedNodeIds[node.id])
      .map((node) => ({
        ...node,
        files: (node.files ?? []).filter((file) => !deletedEntryIds[file.id]),
        images: (node.images ?? []).filter((image) => !deletedEntryIds[image.id]),
        todos: node.todos.filter((todo) => !deletedTodoIds[todo.id]),
      })),
  };
}

function workspaceNameKey(workspace: Workspace) {
  return workspace.name.trim().toLocaleLowerCase("tr-TR");
}

export function mergeCloudSnapshots(local: CloudSnapshot, remote: CloudSnapshot): CloudSnapshot {
  const localById = new Map(local.mindmap.workspaces.map((workspace) => [workspace.id, workspace]));
  const workspaces = remote.mindmap.workspaces.map((workspace) => {
    let current = localById.get(workspace.id);
    if (current) {
      localById.delete(workspace.id);
    } else {
      // Before cloud sync existed, each device created its own random id for
      // the user's "Mint" (or similarly named) workspace. Match that legacy
      // copy by name once, merge its contents, then adopt the cloud id.
      const nameKey = workspaceNameKey(workspace);
      const matchingEntry = [...localById.entries()].find(([, candidate]) => workspaceNameKey(candidate) === nameKey);
      if (matchingEntry) {
        const [localId, candidate] = matchingEntry;
        localById.delete(localId);
        current = candidate;
      }
    }
    return current ? mergeWorkspace(current, workspace) : workspace;
  });
  const mergedWorkspaces = [...workspaces, ...localById.values()];
  const deletedKeepIds = { ...(remote.deletedKeepIds ?? {}), ...(local.deletedKeepIds ?? {}) };
  for (const [id, at] of Object.entries(remote.deletedKeepIds ?? {})) {
    deletedKeepIds[id] = Math.max(at, deletedKeepIds[id] ?? 0);
  }
  for (const [id, at] of Object.entries(local.deletedKeepIds ?? {})) {
    deletedKeepIds[id] = Math.max(at, deletedKeepIds[id] ?? 0);
  }
  return {
    version: 1,
    mindmap: {
      workspaces: mergedWorkspaces,
      // Which workspace is open is a device preference, not shared state.
      currentId: local.mindmap.currentId,
    },
    keep: unionById(local.keep, remote.keep).filter((card) => !deletedKeepIds[card.id]),
    deletedKeepIds,
  };
}

function cloudSnapshot(): CloudSnapshot {
  const map = mindmap.getFullSnapshot();
  // Object URLs and IndexedDB blobs are device-local. Retain their metadata so
  // a card/node remains discoverable; Drive remains the portable file archive.
  const mindmapSnapshot: StoreShape = JSON.parse(JSON.stringify(map, (_key, value) =>
    typeof value === "string" && value.startsWith("blob:") ? "" : value,
  ));
  return {
    version: 1,
    mindmap: mindmapSnapshot,
    keep: keep.list(),
    deletedKeepIds: keep.getDeletedIds(),
  };
}

function parseSnapshot(raw: string): CloudSnapshot | null {
  try {
    const parsed = repairTextTree(JSON.parse(raw)) as CloudSnapshot;
    if (parsed?.version !== 1 || !parsed.mindmap?.workspaces || !Array.isArray(parsed.keep)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Excludes device-local UI selection so two devices do not endlessly overwrite it. */
function comparableSnapshot(snapshot: CloudSnapshot): string {
  return JSON.stringify({
    ...snapshot,
    mindmap: { ...snapshot.mindmap, currentId: "" },
  });
}

let active = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let revision = 0;
let applying = false;
type SyncStatus = { state: "idle" | "syncing" | "success" | "error"; at?: number; message?: string };
let status: SyncStatus = { state: "idle" };

function report(next: SyncStatus) {
  status = next;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<SyncStatus>("mintmap:cloud-sync", { detail: next }));
  }
}

export function getCloudSyncStatus(): SyncStatus {
  return status;
}

async function reconcile() {
  if (active || typeof window === "undefined" || !navigator.onLine) return;
  active = true;
  report({ state: "syncing" });
  try {
    const pulled = await pullCloudSnapshot();
    if (!pulled.enabled) {
      report({ state: "error", at: Date.now(), message: "Bulut veritabanı bağlantısı bulunamadı" });
      return;
    }
    revision = pulled.revision;
    const local = cloudSnapshot();
    const remote = pulled.payload ? parseSnapshot(pulled.payload) : null;
    const merged = remote ? mergeCloudSnapshots(local, remote) : local;
    applying = true;
    mindmap.importFullSnapshot(merged.mindmap);
    keep.importCloudSnapshot(merged.keep, merged.deletedKeepIds);
    applying = false;
    // A poll normally only reads. Write back only when this device contributed
    // something new, preventing two open devices from bouncing revisions.
    if (remote && comparableSnapshot(merged) === comparableSnapshot(remote)) {
      report({ state: "success", at: Date.now() });
      return;
    }
    const pushed = await pushCloudSnapshot({ data: { baseRevision: revision, payload: JSON.stringify(merged) } });
    if (!pushed.enabled) {
      report({ state: "error", at: Date.now(), message: "Bulut veritabanına yazılamadı" });
      return;
    }
    revision = pushed.revision;
    if (!pushed.accepted) {
      const latestRemote = parseSnapshot(pushed.payload);
      if (latestRemote) {
        const retry = mergeCloudSnapshots(cloudSnapshot(), latestRemote);
        applying = true;
        mindmap.importFullSnapshot(retry.mindmap);
        keep.importCloudSnapshot(retry.keep, retry.deletedKeepIds);
        applying = false;
        const retried = await pushCloudSnapshot({ data: { baseRevision: pushed.revision, payload: JSON.stringify(retry) } });
        if (retried.enabled) revision = retried.revision;
      }
    }
    report({ state: "success", at: Date.now() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen eşitleme hatası";
    report({ state: "error", at: Date.now(), message });
    console.warn("MintMap bulut eşitlemesi sonraki denemede tekrar çalışacak", error);
  } finally {
    applying = false;
    active = false;
  }
}

/** Explicit retry for Settings; useful when a device has just come online. */
export async function syncNow() {
  await reconcile();
  return status;
}

function schedule() {
  if (applying) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void reconcile(), DEBOUNCE_MS);
}

/** Keeps notes, task state and map layout merged between all signed-in devices. */
export function useCloudSync() {
  useEffect(() => {
    // The shared shell also renders the launcher on /unlock. Do not make a
    // protected request before the user has an authenticated session.
    if (window.location.pathname === "/unlock") return;
    void reconcile();
    const unsubscribeMap = mindmap.subscribeAll(schedule);
    const unsubscribeKeep = keep.subscribeAll(schedule);
    const onVisible = () => { if (document.visibilityState === "visible") void reconcile(); };
    const onOnline = () => void reconcile();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    const poll = window.setInterval(() => void reconcile(), POLL_MS);
    return () => {
      unsubscribeMap();
      unsubscribeKeep();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.clearInterval(poll);
      if (timer) clearTimeout(timer);
    };
  }, []);
}
