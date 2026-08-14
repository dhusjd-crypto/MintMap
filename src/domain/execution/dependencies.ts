import type { Clock } from "@/lib/architecture/clock";
import { moveTaskState, type ExecutionTask, type TaskDependency } from "./task";

export function getBlockingTasks(
  task: ExecutionTask,
  lookup: (id: string) => ExecutionTask | undefined,
): ExecutionTask[] {
  return task.blockedBy
    .map((dependency) => lookup(dependency.taskId))
    .filter((value): value is ExecutionTask => !!value);
}

export function getBlockedTasks(
  task: ExecutionTask,
  tasks: Iterable<ExecutionTask>,
): ExecutionTask[] {
  return [...tasks].filter((candidate) =>
    candidate.blockedBy.some((dependency) => dependency.taskId === task.id),
  );
}

export function hasIncompleteDependencies(
  task: ExecutionTask,
  lookup: (id: string) => ExecutionTask | undefined,
): boolean {
  return getBlockingTasks(task, lookup).some((blocking) => blocking.state !== "DONE");
}

export function isBlockedByDependencies(
  task: ExecutionTask,
  lookup: (id: string) => ExecutionTask | undefined,
): boolean {
  return task.blockedBy.length > 0 && hasIncompleteDependencies(task, lookup);
}

/** Re-evaluates one blocked task after an explicit dependency event. */
export function reevaluateBlockedTask(
  task: ExecutionTask,
  lookup: (id: string) => ExecutionTask | undefined,
  clock: Clock,
): ExecutionTask | undefined {
  if (task.state !== "BLOCKED" || hasIncompleteDependencies(task, lookup)) return undefined;
  return moveTaskState(task, "READY", clock, { dependenciesIncomplete: false });
}

export function addDependency(
  task: ExecutionTask,
  dependency: TaskDependency,
  lookup: (id: string) => ExecutionTask | undefined,
): ExecutionTask {
  if (dependency.taskId === task.id) throw new Error("Görev kendisine bağımlı olamaz.");
  const dependencyTask = lookup(dependency.taskId);
  if (!dependencyTask) throw new Error("Bağımlı görev bulunamadı.");
  if (hasPath(dependencyTask.id, task.id, lookup, new Set()))
    throw new Error("Döngüsel görev bağımlılığı oluşturulamaz.");
  if (task.blockedBy.some((item) => item.taskId === dependency.taskId)) return task;
  return { ...task, blockedBy: [...task.blockedBy, dependency] };
}

function hasPath(
  from: string,
  target: string,
  lookup: (id: string) => ExecutionTask | undefined,
  visited: Set<string>,
): boolean {
  if (from === target) return true;
  if (visited.has(from)) return false;
  visited.add(from);
  return (lookup(from)?.blockedBy ?? []).some((dependency) =>
    hasPath(dependency.taskId, target, lookup, visited),
  );
}
