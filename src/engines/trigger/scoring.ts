import type { ExecutionTask } from "@/domain/execution/task";
import {
  DEFAULT_TRIGGER_CONFIG,
  type TriggerConfig,
  type TriggerContext,
  type TriggerReason,
} from "./types";

const MS_DAY = 86_400_000;
function localDate(timestamp: number, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}
function sameLocalDay(a: number, b: number, timezone: string) {
  return localDate(a, timezone) === localDate(b, timezone);
}
function dayDifference(a: number, b: number, timezone: string) {
  const dates = [localDate(a, timezone), localDate(b, timezone)].map((value) =>
    Date.parse(`${value}T00:00:00Z`),
  );
  return Math.round((dates[0] - dates[1]) / MS_DAY);
}
function reason(
  code: TriggerReason["code"],
  category: TriggerReason["category"],
  contribution: number,
  severity: TriggerReason["severity"],
  message: string,
  metadata?: TriggerReason["metadata"],
): TriggerReason {
  return { code, category, contribution, severity, message, metadata };
}

export function scoreTask(
  task: ExecutionTask,
  all: readonly ExecutionTask[],
  context: TriggerContext,
  config: TriggerConfig = DEFAULT_TRIGGER_CONFIG,
  downstreamCount = all.filter((candidate) =>
    candidate.blockedBy.some((dependency) => dependency.taskId === task.id),
  ).length,
  downstreamImportantCount = all.filter(
    (candidate) =>
      candidate.blockedBy.some((dependency) => dependency.taskId === task.id) &&
      (candidate.manualPriority === "HIGH" || candidate.manualPriority === "CRITICAL"),
  ).length,
): { score: number; reasons: TriggerReason[] } {
  let score = 0;
  const reasons: TriggerReason[] = [];
  if (task.dueAt !== undefined) {
    const hours = (task.dueAt - context.now) / 3_600_000;
    let contribution = 0;
    let code: TriggerReason["code"] = "DEADLINE_7_DAYS";
    let message = "Son tarih 7 gün içinde.";
    let severity: TriggerReason["severity"] = "INFO";
    if (hours < 0) {
      contribution = config.weights.deadline;
      code = "DEADLINE_OVERDUE";
      message = "Son tarih geçmiş.";
      severity = "CRITICAL";
    } else if (hours <= 24) {
      contribution = config.weights.deadline;
      code = "DEADLINE_HOURS";
      message = "Son tarih 24 saat içinde.";
      severity = "HIGH";
    } else {
      const days = dayDifference(task.dueAt, context.now, context.timezone);
      contribution = days <= 0 ? config.weights.deadline : days <= 1 ? 25 : days <= 3 ? 20 : 12;
      code =
        days <= 0
          ? "DEADLINE_TODAY"
          : days === 1
            ? "DEADLINE_TOMORROW"
            : days <= 3
              ? "DEADLINE_3_DAYS"
              : "DEADLINE_7_DAYS";
      message = `Son tarih ${days <= 0 ? "bugün" : days === 1 ? "yarın" : `${days} gün içinde`}.`;
      severity = days <= 1 ? "HIGH" : "ATTENTION";
    }
    score += contribution;
    reasons.push(reason(code, "DEADLINE", contribution, severity, message, { dueAt: task.dueAt }));
  } else reasons.push(reason("NO_DEADLINE", "DEADLINE", 0, "INFO", "Son tarih belirtilmemiş."));
  const importance = Math.min(
    config.weights.importance,
    Math.round(
      (((task.strategicWeight ?? 0) * 0.5 + (task.impact ?? 0) * 0.5) / 100) *
        config.weights.importance +
        (task.manualPriority === "CRITICAL"
          ? 20
          : task.manualPriority === "HIGH"
            ? 12
            : task.manualPriority === "NORMAL"
              ? 5
              : 0),
    ),
  );
  score += importance;
  reasons.push(
    reason(
      "IMPORTANCE",
      "EXECUTION",
      importance,
      importance >= 12 ? "HIGH" : "INFO",
      importance ? "Öncelik ve etki katkısı." : "Öncelik/etki katkısı yok.",
    ),
  );
  const blocking = Math.min(
    config.weights.blocks,
    downstreamCount * 5 + downstreamImportantCount * 5,
  );
  score += blocking;
  reasons.push(
    reason(
      "BLOCKS_WORK",
      "DEPENDENCY",
      blocking,
      blocking ? "HIGH" : "INFO",
      blocking
        ? `${downstreamCount} işi doğrudan etkiliyor.`
        : "Başka işin doğrudan ön koşulu değil.",
      { count: downstreamCount },
    ),
  );
  if (task.doAt !== undefined && sameLocalDay(task.doAt, context.now, context.timezone)) {
    score += config.weights.plannedToday;
    reasons.push(
      reason(
        "PLANNED_TODAY",
        "PLANNING",
        config.weights.plannedToday,
        "ATTENTION",
        "Bugün planlanmış.",
      ),
    );
  }
  const staleDays = Math.max(0, (context.now - task.lastTouchedAt) / MS_DAY);
  const stale =
    staleDays >= config.staleAfterDays[3]
      ? config.weights.stale
      : staleDays >= config.staleAfterDays[2]
        ? 8
        : staleDays >= config.staleAfterDays[1]
          ? 5
          : staleDays >= config.staleAfterDays[0]
            ? 2
            : 0;
  score += stale;
  reasons.push(
    reason(
      "STALE",
      "STALE",
      stale,
      stale >= 8 ? "HIGH" : "INFO",
      stale ? `${Math.floor(staleDays)} gündür dokunulmadı.` : "Güncelliğini koruyor.",
      { days: Math.floor(staleDays) },
    ),
  );
  const snooze = Math.min(config.weights.snooze, Math.max(0, task.snoozeCount - 1) * 2);
  score += snooze;
  reasons.push(
    reason(
      "SNOOZE_PRESSURE",
      "EXECUTION",
      snooze,
      task.snoozeCount >= config.snoozeDecisionAt ? "HIGH" : "INFO",
      task.snoozeCount ? `${task.snoozeCount} kez ertelendi.` : "Ertelenmedi.",
      { count: task.snoozeCount },
    ),
  );
  if (task.state === "DOING" || task.id === context.currentActiveTaskId) {
    score += config.weights.active;
    reasons.push(
      reason(
        "ACTIVE_CONTINUITY",
        "EXECUTION",
        config.weights.active,
        "ATTENTION",
        "Aktif görev devamlılığı.",
      ),
    );
  }
  if (context.availableSlotMinutes !== undefined && task.estimatedMinutes !== undefined) {
    const fits =
      task.estimatedMinutes <= context.availableSlotMinutes ||
      (task.splittable === true &&
        (task.minChunkMinutes ?? task.estimatedMinutes) <= context.availableSlotMinutes);
    const contribution = fits ? config.weights.fitsSlot : config.weights.doesNotFitSlot;
    score += contribution;
    reasons.push(
      reason(
        fits ? "FITS_SLOT" : "DOES_NOT_FIT_SLOT",
        "CAPACITY",
        contribution,
        fits ? "INFO" : "ATTENTION",
        fits ? "Açık zaman aralığına sığıyor." : "Açık zaman aralığına sığmıyor.",
      ),
    );
  }
  if (
    task.lastNotificationAt !== undefined &&
    context.now - task.lastNotificationAt < MS_DAY &&
    task.notificationCount > 0
  ) {
    const fatigue = config.weights.fatigue;
    score += fatigue;
    reasons.push(
      reason(
        "NOTIFICATION_FATIGUE",
        "EXECUTION",
        fatigue,
        "ATTENTION",
        "Yakın zamanda fazla bildirim aldı.",
      ),
    );
  }
  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons };
}

export { localDate, sameLocalDay, dayDifference };
