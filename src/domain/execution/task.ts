import type { Clock } from "@/lib/architecture/clock";

export type TaskState =
  | "INBOX"
  | "READY"
  | "PLANNED"
  | "NOW"
  | "DOING"
  | "WAITING"
  | "BLOCKED"
  | "SOMEDAY"
  | "DONE"
  | "CANCELLED";

export type ManualPriority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
export type NotificationPolicy = "NORMAL" | "PERSISTENT" | "CRITICAL";
export type EnergyRequirement = "LOW" | "MEDIUM" | "HIGH";

export type TaskDependency = {
  taskId: string;
  requiredState?: "DONE";
};

export type SourceReference = {
  sourceType: string;
  sourceId: string;
};

export type ExecutionTask = {
  id: string;
  title: string;
  description?: string;
  state: TaskState;
  projectId?: string;
  goalId?: string;
  createdAt: number;
  updatedAt: number;
  lastTouchedAt: number;
  startAt?: number;
  doAt?: number;
  softEndAt?: number;
  dueAt?: number;
  remindAt?: number;
  followUpAt?: number;
  estimatedMinutes?: number;
  actualMinutes?: number;
  minChunkMinutes?: number;
  maxChunkMinutes?: number;
  splittable?: boolean;
  startedAt?: number;
  completedAt?: number;
  snoozeCount: number;
  manualPriority?: ManualPriority;
  strategicWeight?: number;
  impact?: number;
  energyRequirement?: EnergyRequirement;
  context?: string;
  waitingFor?: string;
  waitingReason?: string;
  blockedBy: TaskDependency[];
  blocks: TaskDependency[];
  notificationPolicy: NotificationPolicy;
  lastNotificationAt?: number;
  notificationCount: number;
  sourceType?: string;
  sourceId?: string;
  metadata: Record<string, unknown>;
};

export type TaskDatePatch = Pick<
  ExecutionTask,
  "startAt" | "doAt" | "softEndAt" | "dueAt" | "followUpAt"
>;

export type TaskTransitionContext = {
  explicitReopen?: boolean;
  dependenciesIncomplete?: boolean;
};

export const TASK_STATE_SEMANTICS: Readonly<Record<TaskState, string>> = {
  INBOX: "Captured but not yet organized.",
  READY: "Actionable and eligible for execution selection.",
  PLANNED: "Intentionally assigned to a future work period.",
  NOW: "Selected as the current execution candidate.",
  DOING: "Explicitly started by the user.",
  WAITING: "Waiting for an external person, event, or condition.",
  BLOCKED: "Cannot proceed until a prerequisite is complete.",
  SOMEDAY: "Intentionally inactive or backburner work.",
  DONE: "Successfully completed.",
  CANCELLED: "Intentionally abandoned; not unfinished work.",
};

export class TaskDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskDomainError";
  }
}

const ACTIVE_STATES: ReadonlySet<TaskState> = new Set([
  "INBOX",
  "READY",
  "PLANNED",
  "NOW",
  "DOING",
]);

export function createExecutionTask(
  input: Omit<
    Partial<ExecutionTask>,
    | "createdAt"
    | "updatedAt"
    | "lastTouchedAt"
    | "snoozeCount"
    | "notificationCount"
    | "blockedBy"
    | "blocks"
  > &
    Pick<ExecutionTask, "id" | "title">,
  clock: Clock,
): ExecutionTask {
  const now = clock.nowMs();
  const task: ExecutionTask = {
    ...input,
    id: input.id,
    title: input.title.trim(),
    state: input.state ?? "INBOX",
    createdAt: now,
    updatedAt: now,
    lastTouchedAt: now,
    snoozeCount: 0,
    notificationCount: 0,
    blockedBy: [],
    blocks: [],
    notificationPolicy: "NORMAL",
    metadata: input.metadata ?? {},
  };
  validateTask(task);
  return task;
}

export function validateTask(task: ExecutionTask): void {
  if (!task.id.trim()) throw new TaskDomainError("Görev kimliği boş olamaz.");
  if (!task.title.trim()) throw new TaskDomainError("Görev başlığı boş olamaz.");
  for (const [name, value] of [
    ["estimatedMinutes", task.estimatedMinutes],
    ["actualMinutes", task.actualMinutes],
    ["minChunkMinutes", task.minChunkMinutes],
    ["maxChunkMinutes", task.maxChunkMinutes],
  ] as const) {
    if (value !== undefined && (value < 0 || !Number.isFinite(value))) {
      throw new TaskDomainError(`${name} geçerli bir pozitif süre olmalıdır.`);
    }
  }
  if (
    task.minChunkMinutes !== undefined &&
    task.maxChunkMinutes !== undefined &&
    task.minChunkMinutes > task.maxChunkMinutes
  ) {
    throw new TaskDomainError("Minimum parça süresi maksimum parça süresini aşamaz.");
  }
  for (const value of [task.strategicWeight, task.impact]) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 100)) {
      throw new TaskDomainError("Stratejik ağırlık ve etki 0-100 arasında olmalıdır.");
    }
  }
}

export function canTransitionTaskState(
  from: TaskState,
  to: TaskState,
  context: TaskTransitionContext = {},
): boolean {
  if (from === to) return true;
  if ((from === "DONE" || from === "CANCELLED") && !context.explicitReopen) return false;
  if ((to === "READY" || to === "NOW" || to === "DOING") && context.dependenciesIncomplete)
    return false;
  if (from === "WAITING" && to === "NOW") return false;
  if (from === "SOMEDAY" && to === "NOW") return false;
  const allowed: Record<TaskState, readonly TaskState[]> = {
    INBOX: ["READY", "PLANNED", "SOMEDAY", "CANCELLED"],
    READY: ["PLANNED", "NOW", "DOING", "WAITING", "BLOCKED", "SOMEDAY", "DONE", "CANCELLED"],
    PLANNED: ["READY", "NOW", "DOING", "WAITING", "BLOCKED", "SOMEDAY", "CANCELLED"],
    NOW: ["READY", "DOING", "WAITING", "BLOCKED", "DONE", "CANCELLED"],
    DOING: ["READY", "WAITING", "BLOCKED", "DONE", "CANCELLED"],
    WAITING: ["READY", "BLOCKED", "SOMEDAY", "CANCELLED"],
    BLOCKED: ["READY", "WAITING", "SOMEDAY", "CANCELLED"],
    SOMEDAY: ["READY", "PLANNED", "CANCELLED"],
    DONE: ["READY", "PLANNED", "DOING", "CANCELLED"],
    CANCELLED: ["READY", "PLANNED", "SOMEDAY"],
  };
  return allowed[from].includes(to);
}

function touch(task: ExecutionTask, clock: Clock, patch: Partial<ExecutionTask>): ExecutionTask {
  const now = clock.nowMs();
  const next = { ...task, ...patch, updatedAt: now, lastTouchedAt: now };
  validateTask(next);
  return next;
}

export function moveTaskState(
  task: ExecutionTask,
  state: TaskState,
  clock: Clock,
  context: TaskTransitionContext = {},
): ExecutionTask {
  if (!canTransitionTaskState(task.state, state, context)) {
    throw new TaskDomainError(`${task.state} durumundan ${state} durumuna geçiş yapılamaz.`);
  }
  if (state === "DONE") return completeTask(task, clock);
  if (state === "DOING") return startTask(task, clock);
  if (state === "WAITING") return setWaiting(task, task.waitingFor ?? "", clock, task.followUpAt);
  return touch(task, clock, {
    state,
    completedAt: undefined,
  });
}

export function updateTaskDetails(
  task: ExecutionTask,
  patch: Partial<ExecutionTask>,
  clock: Clock,
): ExecutionTask {
  return touch(task, clock, patch);
}

export function startTask(task: ExecutionTask, clock: Clock): ExecutionTask {
  if (!canTransitionTaskState(task.state, "DOING"))
    throw new TaskDomainError("Görev başlatılamaz.");
  return touch(task, clock, { state: "DOING", startedAt: task.startedAt ?? clock.nowMs() });
}

export function completeTask(task: ExecutionTask, clock: Clock): ExecutionTask {
  if (!canTransitionTaskState(task.state, "DONE")) throw new TaskDomainError("Görev tamamlanamaz.");
  const completedAt = clock.nowMs();
  return touch(task, clock, { state: "DONE", completedAt });
}

export function reopenTask(task: ExecutionTask, clock: Clock): ExecutionTask {
  if (!canTransitionTaskState(task.state, "READY", { explicitReopen: true })) {
    throw new TaskDomainError("Görev yeniden açılamaz.");
  }
  return touch(task, clock, { state: "READY", completedAt: undefined });
}

export function cancelTask(task: ExecutionTask, clock: Clock): ExecutionTask {
  if (!canTransitionTaskState(task.state, "CANCELLED"))
    throw new TaskDomainError("Görev iptal edilemez.");
  return touch(task, clock, { state: "CANCELLED" });
}

export function setTaskDates(
  task: ExecutionTask,
  dates: TaskDatePatch,
  clock: Clock,
): ExecutionTask {
  return touch(task, clock, dates);
}

export function setTaskReminder(
  task: ExecutionTask,
  remindAt: number | undefined,
  clock: Clock,
): ExecutionTask {
  return touch(task, clock, { remindAt });
}

export function snoozeTask(task: ExecutionTask, remindAt: number, clock: Clock): ExecutionTask {
  if (!Number.isFinite(remindAt)) throw new TaskDomainError("Erteleme zamanı geçersiz.");
  return touch(task, clock, { remindAt, snoozeCount: task.snoozeCount + 1 });
}

export function setWaiting(
  task: ExecutionTask,
  waitingFor: string,
  clock: Clock,
  followUpAt?: number,
): ExecutionTask {
  if (!waitingFor.trim()) throw new TaskDomainError("Beklenen kişi veya koşul belirtilmelidir.");
  if (!canTransitionTaskState(task.state, "WAITING"))
    throw new TaskDomainError("Görev beklemeye alınamaz.");
  return touch(task, clock, { state: "WAITING", waitingFor: waitingFor.trim(), followUpAt });
}

export function resumeWaiting(task: ExecutionTask, clock: Clock): ExecutionTask {
  if (task.state !== "WAITING") throw new TaskDomainError("Görev bekleme durumunda değil.");
  return touch(task, clock, { state: "READY", waitingFor: undefined });
}

export function moveToSomeday(task: ExecutionTask, clock: Clock): ExecutionTask {
  return moveTaskState(task, "SOMEDAY", clock);
}

export function activateFromSomeday(task: ExecutionTask, clock: Clock): ExecutionTask {
  if (task.state !== "SOMEDAY") throw new TaskDomainError("Görev SOMEDAY durumunda değil.");
  return touch(task, clock, { state: "READY" });
}

export function isTaskTerminal(task: ExecutionTask): boolean {
  return task.state === "DONE" || task.state === "CANCELLED";
}

export function isTaskWaiting(task: ExecutionTask): boolean {
  return task.state === "WAITING";
}

export function isTaskBlocked(task: ExecutionTask): boolean {
  return task.state === "BLOCKED";
}

export function isStartReached(task: ExecutionTask, clock: Clock): boolean {
  return task.startAt === undefined || task.startAt <= clock.nowMs();
}

export function isPlannedForDate(task: ExecutionTask, date: Date): boolean {
  if (task.doAt === undefined) return false;
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const end = start + 86_400_000;
  return task.doAt >= start && task.doAt < end;
}

export function isHardDeadlinePassed(task: ExecutionTask, clock: Clock): boolean {
  return task.dueAt !== undefined && task.dueAt < clock.nowMs() && !isTaskTerminal(task);
}

export function isFollowUpDue(task: ExecutionTask, clock: Clock): boolean {
  return (
    task.state === "WAITING" && task.followUpAt !== undefined && task.followUpAt <= clock.nowMs()
  );
}

export function isTaskScheduledForFuture(task: ExecutionTask, clock: Clock): boolean {
  return task.startAt !== undefined && task.startAt > clock.nowMs();
}

export function isTaskActionable(
  task: ExecutionTask,
  clock: Clock,
  incompleteDependencies = false,
): boolean {
  return (
    ACTIVE_STATES.has(task.state) &&
    task.state !== "INBOX" &&
    !isTaskScheduledForFuture(task, clock) &&
    !incompleteDependencies
  );
}

export function isTaskReadyCandidate(
  task: ExecutionTask,
  clock: Clock,
  incompleteDependencies = false,
): boolean {
  return isTaskActionable(task, clock, incompleteDependencies) && task.state === "READY";
}
