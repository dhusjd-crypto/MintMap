import type { Todo } from "./mindmap-store";

export const PRIORITY_META: Record<
  1 | 2 | 3 | 4,
  { label: string; short: string; color: string; bg: string }
> = {
  1: { label: "Acil", short: "P1", color: "text-red-600", bg: "bg-red-500/10 border-red-500/30" },
  2: { label: "Yüksek", short: "P2", color: "text-amber-600", bg: "bg-amber-500/10 border-amber-500/30" },
  3: { label: "Orta", short: "P3", color: "text-blue-600", bg: "bg-blue-500/10 border-blue-500/30" },
  4: { label: "Düşük", short: "P4", color: "text-muted-foreground", bg: "bg-muted border-border" },
};

/** A todo is blocked if it has any incomplete dependency in the same node. */
export function isBlocked(todo: Todo, siblings: Todo[]): boolean {
  if (!todo.blockedBy?.length) return false;
  const map = new Map(siblings.map((t) => [t.id, t]));
  return todo.blockedBy.some((id) => {
    const dep = map.get(id);
    return !!dep && !dep.done;
  });
}

/** True when completing this task would hide unfinished work below it. */
export function hasOpenDescendants(todo: Todo, todos: Todo[]): boolean {
  const pending = [todo.id];
  while (pending.length) {
    const parentId = pending.pop()!;
    const children = todos.filter((item) => item.parentId === parentId);
    if (children.some((item) => !item.done)) return true;
    pending.push(...children.map((item) => item.id));
  }
  return false;
}

/** Adding `candidateId` as a blocker for `todoId` must not close a dependency loop. */
export function wouldCreateDependencyCycle(todoId: string, candidateId: string, todos: Todo[]): boolean {
  const byId = new Map(todos.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const visit = (id: string): boolean => {
    if (id === todoId) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return (byId.get(id)?.blockedBy ?? []).some(visit);
  };
  return visit(candidateId);
}

/** Sort by priority (lower number first), then due date, then created. */
export function comparePriority(a: Todo, b: Todo): number {
  const pa = a.priority ?? 5;
  const pb = b.priority ?? 5;
  if (pa !== pb) return pa - pb;
  const da = a.dueAt ?? Number.POSITIVE_INFINITY;
  const db = b.dueAt ?? Number.POSITIVE_INFINITY;
  if (da !== db) return da - db;
  return (a.createdAt ?? 0) - (b.createdAt ?? 0);
}
