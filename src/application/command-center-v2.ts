import { taskApplication } from "@/application/task-application";
import { CanonicalExecutionTaskRepository } from "@/application/repositories/canonical-execution-repository";
import { financeApplication } from "@/application/finance/finance-application";
import { financeTriggerApplication } from "@/application/finance/triggers/application";
import type { FinanceAlertView } from "@/application/finance/triggers/types";
import { getSmartView } from "@/application/smart-views";
import type { PlanResult } from "@/domain/planning";
import { DEFAULT_ROUTINE_CONFIG, type RoutineSession, type RoutineType } from "@/domain/review";
import { isRoutineDue } from "@/engines/review";
import { localDate } from "@/engines/trigger/scoring";
import { reviewApplication } from "@/application/review/review-application";

export type CommandCenterSignal = {
  id: string;
  source: "EXECUTION" | "FINANCE";
  severity: "INFO" | "ATTENTION" | "HIGH" | "CRITICAL";
  title: string;
  detail: string;
  entityId?: string;
  href: "/finance" | "/views/$viewId";
};

export type CommandCenterCapacityView = {
  status: "READY" | "NO_PLAN";
  availableMinutes?: number;
  plannedMinutes?: number;
  remainingMinutes?: number;
  overcommitMinutes?: number;
  planId?: string;
  replanRecommended: boolean;
};

export type CommandCenterRoutineView = {
  type: RoutineType;
  title: string;
  status: "DUE" | "ACTIVE";
  href: "/review/$reviewType";
};

const repository = new CanonicalExecutionTaskRepository(taskApplication.repositories.tasks);
const severityOrder = { CRITICAL: 0, HIGH: 1, ATTENTION: 2, INFO: 3 } as const;
const routineLabels: Record<RoutineType, string> = {
  MORNING_PLANNING: "Güne başla",
  MIDDAY_RECALIBRATION: "Gün ortası kontrolü",
  EVENING_SHUTDOWN: "Günü kapat",
  TOMORROW_PLANNING: "Yarını planla",
  WEEKLY_REVIEW: "Haftalık gözden geçirme",
  WEEK_AHEAD_PLANNING: "Haftaya bak",
  REENTRY_RESET: "Yeniden başlama",
};
const routinePriority: readonly RoutineType[] = [
  "REENTRY_RESET",
  "MORNING_PLANNING",
  "MIDDAY_RECALIBRATION",
  "EVENING_SHUTDOWN",
  "TOMORROW_PLANNING",
  "WEEKLY_REVIEW",
  "WEEK_AHEAD_PLANNING",
];

function financeSignal(alert: FinanceAlertView): CommandCenterSignal {
  return {
    id: `${alert.financeBookId}:${alert.triggerId}:${alert.entityId}`,
    source: "FINANCE",
    severity: alert.severity,
    title: alert.title,
    detail: alert.detail,
    entityId: alert.entityId,
    href: "/finance",
  };
}

function capacityView(plan?: PlanResult): CommandCenterCapacityView {
  if (!plan) return { status: "NO_PLAN", replanRecommended: false };
  return {
    status: "READY",
    availableMinutes: plan.capacity.availableMinutes,
    plannedMinutes: plan.capacity.plannedTaskMinutes,
    remainingMinutes: plan.capacity.remainingMinutes,
    overcommitMinutes: plan.capacity.overcommitMinutes,
    planId: plan.dailyPlan.id,
    replanRecommended: plan.dailyPlan.revision > 1 || plan.capacity.overcommitMinutes > 0,
  };
}

function selectRoutine(input: {
  now: number;
  timezone: string;
  sessions: readonly RoutineSession[];
}): CommandCenterRoutineView | undefined {
  const date = localDate(input.now, input.timezone);
  const active = input.sessions.find((session) => session.status === "ACTIVE");
  if (active)
    return {
      type: active.type,
      title: routineLabels[active.type],
      status: "ACTIVE",
      href: "/review/$reviewType",
    };
  const due = routinePriority.find((type) =>
    isRoutineDue(
      type,
      input.now,
      input.timezone,
      input.sessions.find((session) => session.type === type && session.localDate === date),
      DEFAULT_ROUTINE_CONFIG,
    ),
  );
  return due
    ? { type: due, title: routineLabels[due], status: "DUE", href: "/review/$reviewType" }
    : undefined;
}

export function createCommandCenterV2Application(
  deps: {
    listTasks?: () => Promise<readonly import("@/domain/execution/task").ExecutionTask[]>;
    listSessions?: () => Promise<readonly RoutineSession[]>;
    getPlan?: () => Promise<PlanResult | undefined>;
    listFinanceAlerts?: () => Promise<readonly FinanceAlertView[]>;
  } = {},
) {
  return {
    async get(input: { now: number; timezone: string; availableSlotMinutes?: number }) {
      const tasks = deps.listTasks
        ? await deps.listTasks()
        : (await repository.list()).map((record) => record.canonical);
      const common = {
        tasks,
        now: input.now,
        timezone: input.timezone,
        availableSlotMinutes: input.availableSlotMinutes,
      };
      const [
        nowView,
        top3,
        quickWins,
        followUps,
        deadlineRisk,
        plan,
        sessions,
        suppliedAlerts,
        books,
      ] = await Promise.all([
        Promise.resolve(getSmartView({ ...common, viewId: "now" })),
        Promise.resolve(getSmartView({ ...common, viewId: "top-3" })),
        Promise.resolve(getSmartView({ ...common, viewId: "quick-wins" })),
        Promise.resolve(getSmartView({ ...common, viewId: "follow-up" })),
        Promise.resolve(getSmartView({ ...common, viewId: "deadline-risk" })),
        deps.getPlan?.(),
        deps.listSessions?.() ?? reviewApplication.repository.listSessions(),
        deps.listFinanceAlerts?.(),
        deps.listFinanceAlerts ? Promise.resolve([]) : financeApplication.queries.books(),
      ]);
      const financeAlerts =
        suppliedAlerts ??
        (
          await Promise.all(books.map((book) => financeTriggerApplication.evaluate(book.id)))
        ).flatMap((result) => result.alerts);
      const financeObligationIds = new Set(
        tasks
          .filter((task) => task.sourceType === "FINANCIAL_OBLIGATION" && task.sourceId)
          .map((task) => task.sourceId!),
      );
      const executionSignals: CommandCenterSignal[] = [
        ...deadlineRisk.items,
        ...followUps.items,
      ].map((item) => ({
        id: `execution:${item.entityId}`,
        source: "EXECUTION" as const,
        severity: item.reasonCodes.includes("DEADLINE_OVERDUE")
          ? ("CRITICAL" as const)
          : ("HIGH" as const),
        title: item.title,
        detail: item.subtitle ?? "İşlem bekliyor.",
        entityId: item.entityId,
        href: "/views/$viewId" as const,
      }));
      const signals = [
        ...executionSignals,
        ...financeAlerts
          .filter(
            (alert) =>
              !(
                alert.entityType === "FINANCIAL_OBLIGATION" &&
                financeObligationIds.has(alert.entityId)
              ),
          )
          .map(financeSignal),
      ]
        .sort(
          (a, b) =>
            severityOrder[a.severity] - severityOrder[b.severity] || a.id.localeCompare(b.id),
        )
        .slice(0, 4);
      return {
        now: nowView.items[0],
        alternatives: getSmartView({ ...common, viewId: "now" }).items.slice(1, 3),
        top3: top3.items,
        quickWin: quickWins.items[0],
        signals,
        capacity: capacityView(plan),
        routine: selectRoutine({ now: input.now, timezone: input.timezone, sessions }),
        reentryActive: sessions.some(
          (session) => session.type === "REENTRY_RESET" && session.status === "ACTIVE",
        ),
        generatedAt: input.now,
      };
    },
  };
}

export const commandCenterV2Application = createCommandCenterV2Application();
