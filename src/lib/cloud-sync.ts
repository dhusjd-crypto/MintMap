import { useEffect } from "react";
import { keep, type KeepCard } from "./keep-store";
import { mindmap, type MindNode, type StoreShape, type Todo, type Workspace } from "./mindmap-store";
import { pullCloudSnapshot, pushCloudSnapshot } from "./sync.functions";

type CloudSnapshot = { version: 1; mindmap: StoreShape; keep: KeepCard[] };
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

function mergeTodo(local: Todo, remote: Todo): Todo {
  const winner = latest(local, remote);
  const other = winner === local ? remote : local;
  return {
    ...winner,
    // Child structures are append-safe. Their completion changes still follow
    // the most recently edited task record above.
    activity: unionById(winner.activity ?? [], other.activity ?? []),
    attachments: unionById(winner.attachments ?? [], other.attachments ?? []),
    tags: [...new Set([...(winner.tags ?? []), ...(other.tags ?? [])])],
  };
}

function mergeNode(local: MindNode, remote: MindNode): MindNode {
  const winner = latest(local, remote);
  const other = winner === local ? remote : local;
  const remoteTodos = new Map(remote.todos.map((todo) => [todo.id, todo]));
  const todos = local.todos.map((todo) => {
    const fromRemote = remoteTodos.get(todo.id);
    remoteTodos.delete(todo.id);
    return fromRemote ? mergeTodo(todo, fromRemote) : todo;
  });
  return {
    ...winner,
    todos: [...todos, ...remoteTodos.values()],
    links: [...new Set([...(winner.links ?? []), ...(other.links ?? [])])],
    tags: [...new Set([...(winner.tags ?? []), ...(other.tags ?? [])])],
    files: unionById(winner.files ?? [], other.files ?? []),
    images: unionById(winner.images ?? [], other.images ?? []),
  };
}

function mergeWorkspace(local: Workspace, remote: Workspace): Workspace {
  const localById = new Map(local.nodes.map((node) => [node.id, node]));
  const nodes = remote.nodes.map((node) => {
    const current = localById.get(node.id);
    localById.delete(node.id);
    return current ? mergeNode(current, node) : node;
  });
  return { ...latest(local, remote), nodes: [...nodes, ...localById.values()] };
}

export function mergeCloudSnapshots(local: CloudSnapshot, remote: CloudSnapshot): CloudSnapshot {
  const localById = new Map(local.mindmap.workspaces.map((workspace) => [workspace.id, workspace]));
  const workspaces = remote.mindmap.workspaces.map((workspace) => {
    const current = localById.get(workspace.id);
    localById.delete(workspace.id);
    return current ? mergeWorkspace(current, workspace) : workspace;
  });
  const mergedWorkspaces = [...workspaces, ...localById.values()];
  return {
    version: 1,
    mindmap: {
      workspaces: mergedWorkspaces,
      // Which workspace is open is a device preference, not shared state.
      currentId: local.mindmap.currentId,
    },
    keep: unionById(local.keep, remote.keep),
  };
}

function cloudSnapshot(): CloudSnapshot {
  const map = mindmap.getFullSnapshot();
  // Object URLs and IndexedDB blobs are device-local. Retain their metadata so
  // a card/node remains discoverable; Drive remains the portable file archive.
  const mindmapSnapshot: StoreShape = JSON.parse(JSON.stringify(map, (_key, value) =>
    typeof value === "string" && value.startsWith("blob:") ? "" : value,
  ));
  return { version: 1, mindmap: mindmapSnapshot, keep: keep.list() };
}

function parseSnapshot(raw: string): CloudSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as CloudSnapshot;
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
    keep.importCloudSnapshot(merged.keep);
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
        keep.importCloudSnapshot(retry.keep);
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
