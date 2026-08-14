import type { Todo, TodoStatus } from "@/lib/mindmap-store";
import { type ExecutionTask, type ManualPriority, type TaskState } from "@/domain/execution/task";

const stateFromLegacy = (todo: Todo): TaskState => {
  if (todo.done || todo.status === "done") return "DONE";
  if (todo.status === "doing") return "DOING";
  return "READY";
};

const priorityFromLegacy = (priority?: 1 | 2 | 3 | 4): ManualPriority | undefined => {
  if (priority === 1) return "CRITICAL";
  if (priority === 2) return "HIGH";
  if (priority === 3) return "NORMAL";
  if (priority === 4) return "LOW";
  return undefined;
};

export function legacyTaskToDomainTask(
  todo: Todo,
  context: { projectId?: string; goalId?: string } = {},
): ExecutionTask {
  const createdAt = todo.createdAt ?? todo.updatedAt ?? 0;
  const updatedAt = todo.updatedAt ?? createdAt;
  return {
    id: todo.id,
    title: todo.text,
    description: todo.note,
    state: stateFromLegacy(todo),
    projectId: context.projectId,
    goalId: context.goalId,
    createdAt,
    updatedAt,
    lastTouchedAt: updatedAt,
    dueAt: todo.dueAt,
    doAt: todo.myDayAt,
    remindAt: todo.reminderAt,
    estimatedMinutes: todo.estimateMin,
    actualMinutes: todo.focusedMin,
    completedAt: todo.completedAt,
    snoozeCount: 0,
    manualPriority: priorityFromLegacy(todo.priority),
    blockedBy: (todo.blockedBy ?? []).map((taskId) => ({ taskId })),
    blocks: [],
    notificationPolicy: "NORMAL",
    notificationCount: 0,
    metadata: {
      parentId: todo.parentId ?? null,
      starred: todo.starred ?? false,
      focus: todo.focus ?? false,
      myDay: todo.myDay ?? false,
      tags: todo.tags ?? [],
      recurrence: todo.recurrence,
      googleEventId: todo.googleEventId,
      googleTaskId: todo.googleTaskId,
    },
  };
}

export function domainTaskToLegacyPatch(task: ExecutionTask, current: Todo): Partial<Todo> {
  const status: TodoStatus =
    task.state === "DONE" ? "done" : task.state === "DOING" ? "doing" : "todo";
  const patch: Partial<Todo> = { updatedAt: task.updatedAt };
  if (task.title !== current.text) patch.text = task.title;
  if (task.description !== current.note) patch.note = task.description;
  if ((task.state === "DONE") !== current.done) patch.done = task.state === "DONE";
  if (status !== (current.status ?? (current.done ? "done" : "todo"))) patch.status = status;
  if (task.dueAt !== current.dueAt) patch.dueAt = task.dueAt;
  if (task.doAt !== current.myDayAt) patch.myDayAt = task.doAt;
  if (task.startAt !== undefined) patch.updatedAt = task.updatedAt;
  if (task.softEndAt !== undefined) patch.updatedAt = task.updatedAt;
  if (task.followUpAt !== undefined) patch.updatedAt = task.updatedAt;
  if (task.remindAt !== current.reminderAt) patch.reminderAt = task.remindAt;
  if (task.estimatedMinutes !== current.estimateMin) patch.estimateMin = task.estimatedMinutes;
  if (task.actualMinutes !== current.focusedMin) patch.focusedMin = task.actualMinutes;
  if (task.completedAt !== current.completedAt) patch.completedAt = task.completedAt;
  const blockedBy = task.blockedBy.map((dependency) => dependency.taskId);
  if (JSON.stringify(blockedBy) !== JSON.stringify(current.blockedBy ?? []))
    patch.blockedBy = blockedBy;
  if (task.manualPriority) {
    patch.priority = { CRITICAL: 1, HIGH: 2, NORMAL: 3, LOW: 4 }[task.manualPriority] as
      1 | 2 | 3 | 4;
  }
  if (current.done && task.state !== "DONE") patch.completedAt = undefined;
  return patch;
}

export function legacyPatchToDomainPatch(patch: Partial<Todo>): Partial<ExecutionTask> {
  const next: Partial<ExecutionTask> = {};
  if (patch.text !== undefined) next.title = patch.text;
  if (patch.note !== undefined) next.description = patch.note;
  if (patch.dueAt !== undefined) next.dueAt = patch.dueAt;
  if (patch.reminderAt !== undefined) next.remindAt = patch.reminderAt;
  if (patch.estimateMin !== undefined) next.estimatedMinutes = patch.estimateMin;
  if (patch.focusedMin !== undefined) next.actualMinutes = patch.focusedMin;
  if (patch.blockedBy !== undefined) next.blockedBy = patch.blockedBy.map((taskId) => ({ taskId }));
  if (patch.status === "doing") next.state = "DOING";
  if (patch.status === "todo" && !patch.done) next.state = "READY";
  if (patch.status === "done" || patch.done === true) next.state = "DONE";
  if (patch.priority !== undefined) next.manualPriority = priorityFromLegacy(patch.priority);
  return next;
}
