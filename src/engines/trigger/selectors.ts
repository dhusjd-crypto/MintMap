import type { ExecutionTask } from "@/domain/execution/task";
import type { ReEntryPlan, TriggerContext, TriggerResults } from "./types";
import { DEFAULT_TRIGGER_CONFIG } from "./types";
import { sameLocalDay } from "./scoring";

const evaluation = (task: ExecutionTask, results: TriggerResults | undefined) =>
  results?.evaluations.find((item) => item.taskId === task.id);
const order = (tasks: readonly ExecutionTask[], results?: TriggerResults) =>
  [...tasks].sort(
    (a, b) =>
      (evaluation(b, results)?.score ?? 0) - (evaluation(a, results)?.score ?? 0) ||
      (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER) ||
      { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 }[a.manualPriority ?? "NORMAL"] -
        { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 }[b.manualPriority ?? "NORMAL"] ||
      a.createdAt - b.createdAt ||
      a.id.localeCompare(b.id),
  );
export function getNowCandidates(
  tasks: readonly ExecutionTask[],
  _context: TriggerContext,
  results?: TriggerResults,
) {
  return order(
    tasks.filter((task) => evaluation(task, results)?.eligible),
    results,
  );
}
export function getBestNowTask(
  tasks: readonly ExecutionTask[],
  context: TriggerContext,
  results?: TriggerResults,
) {
  return getNowCandidates(tasks, context, results)[0];
}
export function getTop3Today(
  tasks: readonly ExecutionTask[],
  context: TriggerContext,
  results?: TriggerResults,
) {
  return getNowCandidates(tasks, context, results)
    .filter(
      (task) => task.doAt !== undefined && sameLocalDay(task.doAt, context.now, context.timezone),
    )
    .slice(0, context.config?.maxTopToday ?? DEFAULT_TRIGGER_CONFIG.maxTopToday);
}
export function getWaitingFollowUps(tasks: readonly ExecutionTask[], context: TriggerContext) {
  return tasks
    .filter(
      (task) =>
        task.state === "WAITING" && task.followUpAt !== undefined && task.followUpAt <= context.now,
    )
    .sort((a, b) => (a.followUpAt ?? 0) - (b.followUpAt ?? 0));
}
export function getStaleTasks(tasks: readonly ExecutionTask[], context: TriggerContext) {
  return tasks.filter(
    (task) =>
      context.now - task.lastTouchedAt >= (context.config?.staleAfterDays?.[1] ?? 7) * 86_400_000,
  );
}
export function getBlockedTasks(tasks: readonly ExecutionTask[]) {
  return tasks.filter((task) => task.state === "BLOCKED");
}
export function getSomedayTasks(tasks: readonly ExecutionTask[]) {
  return tasks.filter((task) => task.state === "SOMEDAY");
}
export function getDeadlineRisks(
  tasks: readonly ExecutionTask[],
  context: TriggerContext,
  results?: TriggerResults,
) {
  return order(
    tasks.filter((task) => task.dueAt !== undefined && task.dueAt <= context.now + 7 * 86_400_000),
    results,
  );
}
export function getQuickWins(
  tasks: readonly ExecutionTask[],
  context: TriggerContext,
  results?: TriggerResults,
) {
  return order(
    tasks.filter(
      (task) => (task.estimatedMinutes ?? Infinity) <= (context.availableSlotMinutes ?? 15),
    ),
    results,
  );
}
export function getBlockingTasks(tasks: readonly ExecutionTask[]) {
  return tasks.filter((task) =>
    tasks.some((candidate) =>
      candidate.blockedBy.some((dependency) => dependency.taskId === task.id),
    ),
  );
}
export function getProjectsWithoutNextAction(
  tasks: readonly ExecutionTask[],
  context: TriggerContext,
) {
  return [
    ...new Set(
      tasks
        .filter((task) => task.projectId && context.projectSignals?.[task.projectId]?.noNextAction)
        .map((task) => task.projectId!),
    ),
  ]
    .map((projectId) => tasks.find((task) => task.projectId === projectId))
    .filter((task): task is ExecutionTask => !!task);
}
export function getExcessivelySnoozedTasks(
  tasks: readonly ExecutionTask[],
  context: TriggerContext,
) {
  return tasks.filter(
    (task) =>
      task.snoozeCount >=
      (context.config?.snoozeDecisionAt ?? DEFAULT_TRIGGER_CONFIG.snoozeDecisionAt),
  );
}
export function createReEntryPlan(
  tasks: readonly ExecutionTask[],
  context: TriggerContext,
  results: TriggerResults,
): ReEntryPlan {
  const critical = getDeadlineRisks(tasks, context, results).slice(0, 3);
  const waiting = getWaitingFollowUps(tasks, context);
  const quick = getQuickWins(tasks, context, results).slice(0, 1);
  const staleProjectIds = Object.entries(context.projectSignals ?? {})
    .filter(([, value]) => value.stale)
    .map(([id]) => id);
  return {
    createdAt: context.now,
    taskIds: [
      ...new Set(
        [...critical, ...getNowCandidates(tasks, context, results).slice(0, 3)].map(
          (task) => task.id,
        ),
      ),
    ].slice(0, 3),
    waitingFollowUpIds: waiting.map((task) => task.id),
    quickWinIds: quick.map((task) => task.id),
    staleProjectIds,
    deadlineRiskIds: critical.map((task) => task.id),
  };
}
