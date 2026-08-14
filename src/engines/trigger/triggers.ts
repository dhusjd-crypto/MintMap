import type { ExecutionTask } from "@/domain/execution/task";
import type {
  TriggerConfig,
  TriggerContext,
  TriggerEvaluationStatus,
  TriggerSignal,
} from "./types";
import { dayDifference, localDate } from "./scoring";

const signal = (
  id: string,
  category: TriggerSignal["category"],
  status: TriggerEvaluationStatus,
  severity: TriggerSignal["severity"],
  message: string,
  taskId?: string,
  reasonCodes: TriggerSignal["reasonCodes"] = [],
  metadata?: TriggerSignal["metadata"],
): TriggerSignal => ({ id, category, status, severity, message, taskId, reasonCodes, metadata });
export function signalsForTask(
  task: ExecutionTask,
  context: TriggerContext,
  config: TriggerConfig,
): TriggerSignal[] {
  const output: TriggerSignal[] = [];
  if (task.state === "WAITING" && task.followUpAt !== undefined)
    output.push(
      signal(
        "T11",
        "FOLLOW_UP",
        task.followUpAt <= context.now ? "TRIGGERED" : "NOT_TRIGGERED",
        task.followUpAt <= context.now ? "HIGH" : "INFO",
        task.followUpAt <= context.now ? "Takip zamanı geldi." : "Takip zamanı henüz gelmedi.",
        task.id,
        ["FOLLOW_UP_DUE"],
        { followUpAt: task.followUpAt },
      ),
    );
  if (task.dueAt !== undefined) {
    const days = dayDifference(task.dueAt, context.now, context.timezone);
    for (const [id, limit] of [
      ["T04", 7],
      ["T05", 3],
      ["T06", 1],
      ["T07", 0],
    ] as const)
      output.push(
        signal(
          id,
          "DEADLINE",
          days <= limit ? "TRIGGERED" : "NOT_TRIGGERED",
          days <= 0 ? "HIGH" : "ATTENTION",
          days <= limit
            ? `Son tarih ${limit === 0 ? "bugün" : `${limit} gün içinde`}.`
            : "Ufuk dışında.",
          task.id,
          [
            limit === 0
              ? "DEADLINE_TODAY"
              : limit === 1
                ? "DEADLINE_TOMORROW"
                : limit === 3
                  ? "DEADLINE_3_DAYS"
                  : "DEADLINE_7_DAYS",
          ],
        ),
      );
    if ((task.dueAt - context.now) / 3_600_000 <= 24)
      output.push(
        signal("T08", "DEADLINE", "TRIGGERED", "HIGH", "Son tarih saatler içinde.", task.id, [
          "DEADLINE_HOURS",
        ]),
      );
  }
  const staleDays = (context.now - task.lastTouchedAt) / 86_400_000;
  output.push(
    signal(
      "T09",
      "STALE",
      staleDays >= config.staleAfterDays[1] ? "TRIGGERED" : "NOT_TRIGGERED",
      staleDays >= config.staleAfterDays[2] ? "HIGH" : "ATTENTION",
      staleDays >= config.staleAfterDays[1]
        ? "Görev birkaç gündür güncellenmedi."
        : "Görev güncel.",
      task.id,
      ["STALE"],
      { days: Math.floor(staleDays) },
    ),
  );
  output.push(
    signal(
      "T10",
      "STALE",
      staleDays >= config.staleAfterDays[2] ? "TRIGGERED" : "NOT_TRIGGERED",
      "HIGH",
      staleDays >= config.staleAfterDays[2]
        ? "Görev ciddi biçimde eski."
        : "Ciddi eskime eşiğine ulaşmadı.",
      task.id,
      ["STALE"],
    ),
  );
  output.push(
    signal(
      "T22",
      "DEPENDENCY",
      task.blocks.length > 0 ? "TRIGGERED" : "NOT_TRIGGERED",
      task.blocks.length > 0 ? "HIGH" : "INFO",
      task.blocks.length > 0 ? "Başka işleri blokluyor." : "Başka işi bloklamıyor.",
      task.id,
      ["BLOCKS_WORK"],
      { count: task.blocks.length },
    ),
  );
  output.push(
    signal(
      "T13",
      "EXECUTION",
      task.snoozeCount >= config.snoozeWarningAt ? "TRIGGERED" : "NOT_TRIGGERED",
      "ATTENTION",
      task.snoozeCount >= config.snoozeWarningAt
        ? "Tekrarlı erteleme tespit edildi."
        : "Erteleme baskısı yok.",
      task.id,
      ["SNOOZE_PRESSURE"],
    ),
  );
  output.push(
    signal(
      "T14",
      "EXECUTION",
      task.snoozeCount >= config.snoozeDecisionAt ? "TRIGGERED" : "NOT_TRIGGERED",
      "HIGH",
      task.snoozeCount >= config.snoozeDecisionAt
        ? "Bu görev için karar gözden geçirilmeli."
        : "Karar eşiği aşılmadı.",
      task.id,
      ["SNOOZE_PRESSURE"],
    ),
  );
  if (context.availableMinutesToday !== undefined && context.plannedMinutesToday !== undefined)
    output.push(
      signal(
        "T15",
        "CAPACITY",
        context.plannedMinutesToday > context.availableMinutesToday ? "TRIGGERED" : "NOT_TRIGGERED",
        "HIGH",
        context.plannedMinutesToday > context.availableMinutesToday
          ? "Bugünkü plan kapasiteyi aşıyor."
          : "Bugünkü plan kapasite içinde.",
      ),
    );
  else
    output.push(signal("T15", "CAPACITY", "NOT_EVALUATED", "INFO", "Kapasite bağlamı verilmedi."));
  const planningRisk = context.planningRisks?.find((risk) => risk.taskId === task.id);
  if (planningRisk)
    output.push(
      signal(
        "T16",
        "DEADLINE",
        "TRIGGERED",
        "HIGH",
        `Son tarihe kadar ${planningRisk.deficitMinutes} dakika açık var.`,
        task.id,
        [],
        { deficitMinutes: planningRisk.deficitMinutes },
      ),
    );
  else if (
    context.availableMinutesToday !== undefined &&
    context.plannedMinutesToday !== undefined &&
    task.dueAt !== undefined
  )
    output.push(
      signal(
        "T16",
        "DEADLINE",
        context.plannedMinutesToday > context.availableMinutesToday ? "TRIGGERED" : "NOT_TRIGGERED",
        "HIGH",
        context.plannedMinutesToday > context.availableMinutesToday
          ? "Kapasite nedeniyle son tarih riski var."
          : "Açık kapasiteye göre risk görünmüyor.",
      ),
    );
  else
    output.push(
      signal(
        "T16",
        "DEADLINE",
        "NOT_EVALUATED",
        "INFO",
        "Son tarih riski için kapasite bağlamı eksik.",
      ),
    );
  if (context.calendar)
    output.push(
      signal(
        "T17",
        "CALENDAR",
        context.calendar.verified && context.calendar.availableMinutes > 0
          ? "TRIGGERED"
          : "NOT_TRIGGERED",
        "INFO",
        context.calendar.verified && context.calendar.availableMinutes > 0
          ? "Doğrulanmış takvim aralığı var."
          : "Uygun doğrulanmış aralık yok.",
        undefined,
        ["SIGNAL_VERIFIED"],
      ),
    );
  else output.push(signal("T17", "CALENDAR", "NOT_EVALUATED", "INFO", "Takvim sinyali verilmedi."));
  if (task.estimatedMinutes !== undefined && context.availableSlotMinutes !== undefined)
    output.push(
      signal(
        "T24",
        "CAPACITY",
        task.estimatedMinutes <= context.availableSlotMinutes ? "TRIGGERED" : "NOT_TRIGGERED",
        "INFO",
        task.estimatedMinutes <= context.availableSlotMinutes
          ? "Kısa zaman aralığına sığan hızlı kazanım."
          : "Kısa zaman aralığına sığmıyor.",
        task.id,
        [task.estimatedMinutes <= context.availableSlotMinutes ? "FITS_SLOT" : "DOES_NOT_FIT_SLOT"],
      ),
    );
  return output;
}

export function systemSignals(
  tasks: readonly ExecutionTask[],
  context: TriggerContext,
  config: TriggerConfig,
): TriggerSignal[] {
  const output = tasks.flatMap((task) => signalsForTask(task, context, config));
  if (context.availableMinutesToday !== undefined && context.plannedMinutesToday !== undefined)
    output.push(
      signal(
        "T15",
        "CAPACITY",
        context.plannedMinutesToday > context.availableMinutesToday ? "TRIGGERED" : "NOT_TRIGGERED",
        context.plannedMinutesToday > context.availableMinutesToday ? "HIGH" : "INFO",
        context.plannedMinutesToday > context.availableMinutesToday
          ? "Bugünkü plan kapasiteyi aşıyor."
          : "Bugünkü plan kapasite içinde.",
      ),
    );
  else
    output.push(signal("T15", "CAPACITY", "NOT_EVALUATED", "INFO", "Kapasite bağlamı verilmedi."));
  const staleProjects = Object.entries(context.projectSignals ?? {})
    .filter(([, value]) => value.stale)
    .map(([id]) => id);
  for (const id of staleProjects)
    output.push(
      signal(
        "T21",
        "PROJECT",
        "TRIGGERED",
        "ATTENTION",
        "Proje güncelliğini yitirmiş.",
        undefined,
        ["STALE"],
        { projectId: id },
      ),
    );
  output.push(
    signal("T01", "PLANNING", "TRIGGERED", "ATTENTION", "Günün ilk üç adayı hesaplandı."),
  );
  output.push(signal("T02", "EXECUTION", "TRIGGERED", "INFO", "En uygun NOW adayı hesaplandı."));
  output.push(
    signal(
      "T03",
      "EXECUTION",
      "NOT_EVALUATED",
      "INFO",
      "Uyarlanabilir kontrol için çalışma oturumu bağlamı verilmedi.",
    ),
  );
  if (context.meetingCancelled)
    output.push(
      signal(
        "T18",
        "CALENDAR",
        context.meetingCancelled.verified ? "TRIGGERED" : "NOT_EVALUATED",
        "ATTENTION",
        context.meetingCancelled.verified
          ? "Doğrulanmış toplantı iptali zaman açtı."
          : "Toplantı iptali doğrulanmadı.",
        undefined,
        context.meetingCancelled.verified ? ["SIGNAL_VERIFIED"] : [],
      ),
    );
  else
    output.push(
      signal("T18", "CALENDAR", "NOT_EVALUATED", "INFO", "Toplantı iptali sinyali verilmedi."),
    );
  if (context.scheduleChanged)
    output.push(
      signal(
        "T19",
        "CALENDAR",
        context.scheduleChanged.verified
          ? context.scheduleChanged.requiresReplan
            ? "TRIGGERED"
            : "NOT_TRIGGERED"
          : "NOT_EVALUATED",
        "ATTENTION",
        context.scheduleChanged.requiresReplan
          ? "Takvim değişikliği yeniden planlama gerektiriyor."
          : "Takvim değişikliği yeniden planlama gerektirmiyor.",
        undefined,
        context.scheduleChanged.verified ? ["SIGNAL_VERIFIED"] : [],
      ),
    );
  else
    output.push(
      signal("T19", "CALENDAR", "NOT_EVALUATED", "INFO", "Program değişikliği sinyali verilmedi."),
    );
  output.push(
    signal("T12", "DEPENDENCY", "NOT_TRIGGERED", "INFO", "Bağımlılık tamamlanma olayı yok."),
  );
  if (context.lastActiveAt !== undefined)
    output.push(
      signal(
        "T20",
        "REENTRY",
        context.now - context.lastActiveAt >= 2 * 86_400_000 ? "TRIGGERED" : "NOT_TRIGGERED",
        "ATTENTION",
        context.now - context.lastActiveAt >= 2 * 86_400_000
          ? "Kullanıcı geri döndü; yeniden giriş planı hazır."
          : "İnaktivite eşiği aşılmadı.",
      ),
    );
  const waiting = tasks.filter((task) => task.state === "WAITING");
  output.push(
    signal(
      "T23",
      "FOLLOW_UP",
      waiting.length >= 3 ? "TRIGGERED" : "NOT_TRIGGERED",
      "ATTENTION",
      `${waiting.length} bekleyen görev var.`,
    ),
  );
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: context.timezone,
      hour: "numeric",
      hour12: false,
    }).format(new Date(context.now)),
  );
  const tomorrowDate = localDate(context.now + 86_400_000, context.timezone);
  const planned =
    context.lastTomorrowPlanAt !== undefined &&
    localDate(context.lastTomorrowPlanAt, context.timezone) ===
      localDate(context.now, context.timezone);
  output.push(
    signal(
      "T25",
      "PLANNING",
      hour >= config.tomorrowPlanningHour && !planned ? "TRIGGERED" : "NOT_TRIGGERED",
      "ATTENTION",
      hour >= config.tomorrowPlanningHour && !planned
        ? `Yarın (${tomorrowDate}) için planlama zamanı.`
        : "Yarın planlama sinyali yok.",
    ),
  );
  return output;
}
