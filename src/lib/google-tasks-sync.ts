import { googleTasksSyncPull, googleTasksSyncPush } from "./google/tasks";
import { mindmap } from "./mindmap-store";
import { hasOpenDescendants } from "./task-utils";

/**
 * Reconciles MintMap-owned Google Tasks. Google completion/reopening wins for
 * linked tasks; MintMap then upserts the final state back to Google Tasks.
 */
export async function runGoogleTasksSync(): Promise<{ pushed: number; pulled: number; errors: number }> {
  let pulled = 0;
  let errors = 0;
  const linked = mindmap.allTodos().filter((item) => item.todo.googleTaskId && item.todo.googleTaskListId);
  const byList = new Map<string, string[]>();
  linked.forEach((item) => {
    const listId = item.todo.googleTaskListId!;
    byList.set(listId, [...(byList.get(listId) ?? []), item.todo.googleTaskId!]);
  });

  for (const [listId, taskIds] of byList) {
    try {
      const remote = await googleTasksSyncPull({ data: { listId, taskIds } });
      remote.updates.forEach((update) => {
        const item = mindmap.allTodos().find(
          (candidate) => candidate.todo.googleTaskId === update.googleTaskId && candidate.todo.googleTaskListId === listId,
        );
        if (!item) return;
        if (update.status === "missing") {
          mindmap.updateTodoIn(item.wsId, item.nodeId, item.todo.id, {
            googleTaskId: undefined,
            googleTaskListId: undefined,
            syncedAt: Date.now(),
          });
          pulled += 1;
          return;
        }
        const remoteDone = update.status === "completed";
        if (remoteDone === item.todo.done) return;
        const node = mindmap.getFullSnapshot().workspaces
          .find((workspace) => workspace.id === item.wsId)
          ?.nodes.find((candidate) => candidate.id === item.nodeId);
        // An incomplete child always keeps its parent open, no matter where the
        // completion originated. The next push repairs Google Tasks too.
        if (remoteDone && node && hasOpenDescendants(item.todo, node.todos)) return;
        mindmap.updateTodoIn(item.wsId, item.nodeId, item.todo.id, {
          done: remoteDone,
          status: remoteDone ? "done" : "todo",
          completedAt: remoteDone ? Date.now() : undefined,
          syncedAt: Date.now(),
        });
        pulled += 1;
      });
    } catch {
      errors += 1;
    }
  }

  const cutoff = Date.now() - 30 * 86_400_000;
  const items = mindmap.allTodos().filter(
    (item) => !item.todo.done || (item.todo.completedAt ?? 0) > cutoff,
  );
  if (!items.length) return { pushed: 0, pulled, errors };

  const result = await googleTasksSyncPush({
    data: {
      items: items.map((item) => ({
        key: `${item.wsId}:${item.nodeId}:${item.todo.id}`,
        title: item.todo.text,
        description: [
          `MintMap · ${item.wsName} · ${item.nodeTitle}`,
          item.todo.note,
          ...(item.todo.activity ?? []).slice(-3).map((entry) => entry.text),
        ]
          .filter(Boolean)
          .join("\n\n"),
        dueAt: item.todo.dueAt,
        done: item.todo.done,
        googleTaskId: item.todo.googleTaskId,
        googleTaskListId: item.todo.googleTaskListId,
      })),
    },
  });

  let pushed = 0;
  result.results.forEach((entry) => {
    const item = items.find((candidate) => `${candidate.wsId}:${candidate.nodeId}:${candidate.todo.id}` === entry.key);
    if (!item) return;
    if (entry.error) {
      errors += 1;
      return;
    }
    pushed += 1;
    mindmap.updateTodoIn(item.wsId, item.nodeId, item.todo.id, {
      googleTaskId: entry.googleTaskId,
      googleTaskListId: result.listId,
      syncedAt: Date.now(),
    });
  });
  return { pushed, pulled, errors };
}

const AUTO_KEY = "mintmap.tasks.auto";
const INTERVAL = 15 * 60_000;

/** Polls only while the app is open and the user has explicitly enabled it. */
export function useAutoGoogleTasksSync() {
  if (typeof window === "undefined" || localStorage.getItem(AUTO_KEY) !== "on") return;
  const tick = () => {
    void runGoogleTasksSync().then(
      () => localStorage.setItem("mintmap.tasks.lastSyncAt", String(Date.now())),
      (error) => console.warn("[google-tasks-sync] failed:", (error as Error).message),
    );
  };
  const first = window.setTimeout(tick, 15_000);
  const interval = window.setInterval(tick, INTERVAL);
  return () => {
    window.clearTimeout(first);
    window.clearInterval(interval);
  };
}
