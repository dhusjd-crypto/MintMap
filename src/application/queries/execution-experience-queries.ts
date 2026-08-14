import type { ExecutionTask } from "@/domain/execution/task";
import type { PlanResult } from "@/engines/planner";
import {
  TriggerEngine,
  getBestNowTask,
  getQuickWins,
  getTop3Today,
  getWaitingFollowUps,
} from "@/engines/trigger";
import type { TriggerReasonCode, TriggerSeverity } from "@/engines/trigger";
import { legacyTaskToDomainTask } from "../mapping/execution-task-mapping";
import type { TaskRecord } from "../repositories/task-repository";

export type NowTaskView = {
  taskId: string;
  title: string;
  projectTitle?: string;
  goalTitle?: string;
  state: ExecutionTask["state"];
  estimatedMinutes?: number;
  dueAt?: number;
  triggerScore: number;
  reasonSummaries: readonly string[];
  reasonCodes: readonly TriggerReasonCode[];
  slotFit?: boolean;
  active: boolean;
  availableActions: readonly string[];
};
export type ExecutionSignalView = {
  id: string;
  type: string;
  severity: TriggerSeverity;
  title: string;
  detail: string;
  entityId?: string;
  reasonCodes: readonly TriggerReasonCode[];
  actions: readonly string[];
};
export type ExecutionNowView = {
  primary?: NowTaskView;
  alternatives: readonly NowTaskView[];
  top3: readonly NowTaskView[];
  quickWins: readonly NowTaskView[];
  waitingFollowUps: readonly NowTaskView[];
  signals: readonly ExecutionSignalView[];
  capacity?: PlanResult["capacity"];
  currentSlot?: { availableMinutes: number };
  generatedAt: number;
  emptyReason?: "NO_TASKS" | "NO_ELIGIBLE_TASKS" | "NO_ESTIMATES";
};

const reasonLabels: Partial<Record<TriggerReasonCode, string>> = {
  DEADLINE_OVERDUE: "Son tarih geçmiş.",
  DEADLINE_HOURS: "Son tarih 24 saat içinde.",
  DEADLINE_TODAY: "Son tarih bugün.",
  DEADLINE_TOMORROW: "Son tarih yarın.",
  DEADLINE_3_DAYS: "Son tarih 3 gün içinde.",
  DEADLINE_7_DAYS: "Son tarih 7 gün içinde.",
  IMPORTANCE: "Önceliği yüksek.",
  BLOCKS_WORK: "Başka işleri açıyor.",
  PLANNED_TODAY: "Bugün için planlandı.",
  STALE: "Bir süredir ilerletilmedi.",
  ACTIVE_CONTINUITY: "Mevcut odağı koruyor.",
  FITS_SLOT: "Mevcut zaman aralığına uyuyor.",
  FOLLOW_UP_DUE: "Takip zamanı geldi.",
  SNOOZE_PRESSURE: "Birden fazla ertelendi.",
};
function viewFor(
  record: TaskRecord,
  task: ExecutionTask,
  score: number,
  reasons: readonly { code: TriggerReasonCode; message: string }[],
  active: boolean,
  slotFit?: boolean,
): NowTaskView {
  const summaries = [
    ...new Set(reasons.map((reason) => reasonLabels[reason.code] ?? reason.message)),
  ].slice(0, 3);
  return {
    taskId: task.id,
    title: task.title,
    projectTitle: record.nodeTitle,
    state: task.state,
    estimatedMinutes: task.estimatedMinutes,
    dueAt: task.dueAt,
    triggerScore: score,
    reasonSummaries: summaries,
    reasonCodes: [...new Set(reasons.map((reason) => reason.code))],
    slotFit,
    active,
    availableActions: [
      "START",
      "DONE",
      "SNOOZE",
      "CANNOT_DO_TODAY",
      "MOVE_TO_WAITING",
      "OPEN_DETAILS",
    ],
  };
}

export function createExecutionExperienceQueries(dependencies: {
  listTasks: () => TaskRecord[];
  trigger?: TriggerEngine;
}) {
  const trigger = dependencies.trigger ?? new TriggerEngine();
  return {
    getExecutionNowView(input: {
      now: number;
      timezone: string;
      planner?: PlanResult;
      activeTaskId?: string;
      availableSlotMinutes?: number;
    }): ExecutionNowView {
      const records = dependencies.listTasks();
      const domainTasks = records.map((record) =>
        legacyTaskToDomainTask(record.task, { projectId: record.nodeId }),
      );
      const plannerContext = input.planner
        ? {
            availableMinutesToday: input.planner.capacity.remainingMinutes,
            plannedMinutesToday: input.planner.capacity.plannedTaskMinutes,
            overcommitMinutes: input.planner.capacity.overcommitMinutes,
            planningRisks: input.planner.capacity.tasksAtRisk,
          }
        : {};
      const context = {
        now: input.now,
        timezone: input.timezone,
        availableSlotMinutes: input.availableSlotMinutes,
        currentActiveTaskId: input.activeTaskId,
        ...plannerContext,
      };
      const results = trigger.evaluateTasks(domainTasks, context);
      const eligible = domainTasks.filter(
        (task) => results.evaluations.find((item) => item.taskId === task.id)?.eligible,
      );
      const evaluation = (task: ExecutionTask) =>
        results.evaluations.find((item) => item.taskId === task.id);
      const make = (task: ExecutionTask) => {
        const record = records.find((item) => item.task.id === task.id)!;
        const item = evaluation(task);
        return viewFor(
          record,
          task,
          item?.score ?? 0,
          item?.reasons ?? [],
          task.id === input.activeTaskId,
          task.estimatedMinutes !== undefined && input.availableSlotMinutes !== undefined
            ? task.estimatedMinutes <= input.availableSlotMinutes
            : undefined,
        );
      };
      const primaryTask = getBestNowTask(domainTasks, context, results);
      const top3Tasks = getTop3Today(domainTasks, context, results);
      const quickWinTasks = getQuickWins(domainTasks, context, results).slice(0, 3);
      const followUpTasks = getWaitingFollowUps(domainTasks, context).slice(0, 3);
      const primary = primaryTask ? make(primaryTask) : undefined;
      const alternatives = eligible
        .filter((task) => task.id !== primaryTask?.id)
        .slice(0, 2)
        .map(make);
      const signals = results.signals
        .filter((signal) => signal.status === "TRIGGERED")
        .sort(
          (a, b) =>
            ({ CRITICAL: 0, HIGH: 1, ATTENTION: 2, INFO: 3 })[a.severity] -
            { CRITICAL: 0, HIGH: 1, ATTENTION: 2, INFO: 3 }[b.severity],
        )
        .slice(0, 4)
        .map((signal) => ({
          id: signal.id,
          type: signal.category,
          severity: signal.severity,
          title: signal.message,
          detail: signal.message,
          entityId: signal.taskId,
          reasonCodes: signal.reasonCodes,
          actions: ["OPEN_TASK"],
        }));
      return {
        primary,
        alternatives,
        top3: top3Tasks.map(make),
        quickWins: quickWinTasks.map(make),
        waitingFollowUps: followUpTasks.map(make),
        signals,
        capacity: input.planner?.capacity,
        currentSlot:
          input.availableSlotMinutes === undefined
            ? undefined
            : { availableMinutes: input.availableSlotMinutes },
        generatedAt: input.now,
        emptyReason:
          records.length === 0
            ? "NO_TASKS"
            : primary
              ? undefined
              : eligible.length === 0
                ? "NO_ELIGIBLE_TASKS"
                : "NO_ESTIMATES",
      };
    },
  };
}
