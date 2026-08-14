import type { ExecutionTask } from "@/domain/execution/task";

export type RandomSource = { next(): number };

export const systemRandomSource: RandomSource = { next: () => Math.random() };

export function getThisOrThat(tasks: ExecutionTask[], now: number) {
  return tasks
    .filter((task) => task.state === "READY" || task.state === "DOING")
    .filter((task) => task.dueAt === undefined || task.dueAt >= now)
    .sort(
      (a, b) =>
        (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER) ||
        a.createdAt - b.createdAt ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 2);
}

export function pickTaskJar<T>(
  candidates: readonly T[],
  random: RandomSource = systemRandomSource,
) {
  if (candidates.length === 0) return undefined;
  const index = Math.min(candidates.length - 1, Math.floor(random.next() * candidates.length));
  return candidates[index];
}
