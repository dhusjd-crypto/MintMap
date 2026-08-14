import type { ExecutionTask } from "@/domain/execution/task";
import type { FocusSession } from "@/domain/focus";
import { localDate, sameLocalDay } from "@/engines/trigger/scoring";
import {
  DEFAULT_ROUTINE_CONFIG,
  type MorningPlanResult,
  type ReviewCapacity,
  type ReviewSummary,
  type RoutineConfig,
  type RoutineSession,
  type RoutineType,
} from "@/domain/review";

const DAY = 86_400_000;
const unfinished = (task: ExecutionTask) => task.state !== "DONE" && task.state !== "CANCELLED";

export function isRoutineDue(
  type: RoutineType,
  now: number,
  timezone: string,
  last?: RoutineSession,
  config: RoutineConfig = DEFAULT_ROUTINE_CONFIG,
) {
  const date = localDate(now, timezone);
  if (last?.localDate === date && ["COMPLETED", "SKIPPED"].includes(last.status)) return false;
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", hour12: false }).format(
      new Date(now),
    ),
  );
  if (type === "MORNING_PLANNING")
    return (
      config.morningPlanningEnabled &&
      hour >= config.morningWindow[0] &&
      hour < config.morningWindow[1]
    );
  if (type === "MIDDAY_RECALIBRATION")
    return config.middayEnabled && hour >= config.middayWindow[0] && hour < config.middayWindow[1];
  if (type === "EVENING_SHUTDOWN")
    return config.eveningShutdownEnabled && hour >= config.eveningWindow[0];
  if (type === "TOMORROW_PLANNING")
    return config.tomorrowPlanningEnabled && hour >= config.tomorrowPlanningTime;
  if (type === "WEEKLY_REVIEW")
    return (
      config.weeklyReviewEnabled &&
      new Date(now).getUTCDay() === config.weeklyReviewDay &&
      hour >= config.weeklyReviewWindow[0]
    );
  if (type === "REENTRY_RESET") return false;
  return true;
}

export function createReviewEngine(config: RoutineConfig = DEFAULT_ROUTINE_CONFIG) {
  const summarize = (
    type: RoutineType,
    title: string,
    date: string,
    primaryItems: ExecutionTask[],
    secondaryItems: ExecutionTask[],
    warnings: string[] = [],
    capacity?: ReviewCapacity,
    recommendedAction: ReviewSummary["recommendedAction"] = "REVIEW",
  ): ReviewSummary => ({
    type,
    title,
    localDate: date,
    primaryItems: primaryItems.slice(0, 8),
    secondaryItems: secondaryItems.slice(0, 8),
    warnings,
    capacity,
    recommendedAction,
  });
  return {
    getMorning(
      tasks: ExecutionTask[],
      now: number,
      timezone: string,
      capacity?: ReviewCapacity,
    ): MorningPlanResult {
      const date = localDate(now, timezone);
      const yesterday = new Date(now - DAY).toISOString().slice(0, 10);
      const leftovers = tasks.filter(
        (task) =>
          unfinished(task) &&
          task.doAt !== undefined &&
          localDate(task.doAt, timezone) === yesterday,
      );
      const today = tasks.filter(
        (task) =>
          unfinished(task) && task.doAt !== undefined && sameLocalDay(task.doAt, now, timezone),
      );
      const dueFollowUps = tasks.filter(
        (task) =>
          unfinished(task) &&
          task.state === "WAITING" &&
          task.followUpAt !== undefined &&
          task.followUpAt <= now,
      );
      const deadlineRisks = tasks
        .filter(
          (task) => unfinished(task) && task.dueAt !== undefined && task.dueAt <= now + 2 * DAY,
        )
        .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
      const warnings =
        capacity && capacity.overcommitMinutes > 0
          ? [`Bugünkü plan ${capacity.overcommitMinutes} dakika kapasiteyi aşıyor.`]
          : [];
      return {
        localDate: date,
        leftovers,
        top3: today.slice(0, 3),
        dueFollowUps,
        deadlineRisks,
        capacity,
        warnings,
      };
    },
    getMidday(
      tasks: ExecutionTask[],
      now: number,
      timezone: string,
      capacity?: ReviewCapacity,
      activeTaskId?: string,
    ) {
      const today = tasks.filter(
        (task) =>
          unfinished(task) && task.doAt !== undefined && sameLocalDay(task.doAt, now, timezone),
      );
      const completedToday = tasks.filter(
        (task) => task.completedAt !== undefined && sameLocalDay(task.completedAt, now, timezone),
      );
      const risks = tasks.filter(
        (task) => unfinished(task) && task.dueAt !== undefined && task.dueAt <= now + DAY,
      );
      return summarize(
        "MIDDAY_RECALIBRATION",
        "Gün ortası kontrolü",
        localDate(now, timezone),
        activeTaskId ? tasks.filter((task) => task.id === activeTaskId) : [],
        [...completedToday, ...today],
        capacity && capacity.overcommitMinutes > 0
          ? ["Plan kapasiteyi aşıyor; mevcut işi koruyup esnek işleri gözden geçir."]
          : risks.length
            ? ["Yaklaşan son tarihler var."]
            : [],
        capacity,
        "REVIEW",
      );
    },
    getShutdown(
      tasks: ExecutionTask[],
      now: number,
      timezone: string,
      focus?: FocusSession,
      capacity?: ReviewCapacity,
    ) {
      const today = tasks.filter(
        (task) => task.doAt !== undefined && sameLocalDay(task.doAt, now, timezone),
      );
      const open = today.filter(unfinished);
      const wins = tasks.filter(
        (task) => task.completedAt !== undefined && sameLocalDay(task.completedAt, now, timezone),
      );
      const warnings =
        focus?.status === "ACTIVE"
          ? ["Açık bir odak oturumu var; kapatmadan günü tamamlamayın."]
          : [];
      return summarize(
        "EVENING_SHUTDOWN",
        "Günü kapat",
        localDate(now, timezone),
        wins,
        open,
        warnings,
        capacity,
        "CLOSE",
      );
    },
    getTomorrow(tasks: ExecutionTask[], now: number, timezone: string, capacity?: ReviewCapacity) {
      const tomorrow = localDate(now + DAY, timezone);
      const candidates = tasks.filter(
        (task) =>
          unfinished(task) &&
          ((task.doAt !== undefined && localDate(task.doAt, timezone) === tomorrow) ||
            (task.dueAt !== undefined && localDate(task.dueAt, timezone) === tomorrow)),
      );
      return summarize(
        "TOMORROW_PLANNING",
        "Yarını planla",
        tomorrow,
        candidates,
        tasks.filter((task) => unfinished(task) && task.manualPriority === "CRITICAL"),
        capacity && capacity.overcommitMinutes > 0 ? ["Yarın için kapasite uyarısı var."] : [],
        capacity,
        "PLAN",
      );
    },
    getWeekly(tasks: ExecutionTask[], now: number, timezone: string, capacity?: ReviewCapacity) {
      const date = localDate(now, timezone);
      const completed = tasks.filter(
        (task) =>
          task.completedAt !== undefined &&
          task.completedAt >= now - 7 * DAY &&
          task.completedAt <= now,
      );
      const unfinishedImportant = tasks.filter(
        (task) =>
          unfinished(task) &&
          (task.manualPriority === "CRITICAL" || task.manualPriority === "HIGH"),
      );
      const waiting = tasks.filter((task) => task.state === "WAITING");
      const stale = tasks.filter((task) => unfinished(task) && now - task.lastTouchedAt >= 7 * DAY);
      const snoozed = tasks.filter((task) => unfinished(task) && task.snoozeCount >= 3);
      return summarize(
        "WEEKLY_REVIEW",
        "Haftalık gözden geçirme",
        date,
        completed,
        [...unfinishedImportant, ...waiting, ...stale, ...snoozed],
        [],
        capacity,
        "REVIEW",
      );
    },
    getReentry(tasks: ExecutionTask[], now: number, timezone: string, capacity?: ReviewCapacity) {
      const active = tasks
        .filter(unfinished)
        .sort(
          (a, b) => (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER),
        );
      const dueWaiting = active.filter(
        (task) =>
          task.state === "WAITING" && task.followUpAt !== undefined && task.followUpAt <= now,
      );
      const stale = active.filter(
        (task) => now - task.lastTouchedAt >= config.reentryInactivityThresholdDays * DAY,
      );
      return summarize(
        "REENTRY_RESET",
        "Yeniden başlama",
        localDate(now, timezone),
        active.slice(0, 3),
        [...dueWaiting, ...stale.slice(0, 2)],
        [],
        capacity,
        "START",
      );
    },
  };
}
