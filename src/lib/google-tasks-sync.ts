import { googleTasksSyncPush } from "./google/tasks";
import { mindmap } from "./mindmap-store";

/** Pushes MintMap work into its own Google Tasks list without importing or changing other lists. */
export async function runGoogleTasksSync(): Promise<{ pushed: number; errors: number }> {
  const cutoff = Date.now() - 30 * 86_400_000;
  const items = mindmap.allTodos().filter(
    (item) => !item.todo.done || (item.todo.completedAt ?? 0) > cutoff,
  );
  if (!items.length) return { pushed: 0, errors: 0 };

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
  let errors = 0;
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
  return { pushed, errors };
}
