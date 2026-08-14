import type { ExecutionTask } from "@/domain/execution/task";
import {
  TriggerEngine,
  getBestNowTask,
  getBlockedTasks,
  getBlockingTasks,
  getDeadlineRisks,
  getNowCandidates,
  getQuickWins,
  getStaleTasks,
  getSomedayTasks,
  getTop3Today,
  getWaitingFollowUps,
} from "@/engines/trigger";
import { sameLocalDay } from "@/engines/trigger/scoring";
import type { TriggerContext, TriggerResults } from "@/engines/trigger";

export const SMART_VIEW_IDS = [
  "now",
  "top-3",
  "today",
  "week",
  "waiting",
  "follow-up",
  "stale",
  "deadline-risk",
  "blocked",
  "blocking",
  "quick-wins",
  "office",
  "phone",
  "outside",
  "low-energy",
  "deep-work",
  "someday",
  "completed",
] as const;
export type SmartViewId = (typeof SMART_VIEW_IDS)[number];
export type SmartViewDefinition = {
  id: SmartViewId;
  label: string;
  description: string;
  domain: "EXECUTION";
  defaultSort: string;
};
export type SmartViewItem = {
  entityType: "TASK";
  entityId: string;
  title: string;
  subtitle?: string;
  state: ExecutionTask["state"];
  dueAt?: number;
  doAt?: number;
  followUpAt?: number;
  estimatedMinutes?: number;
  reasonCodes: readonly string[];
  actions: readonly string[];
};
export type SmartViewResult = {
  viewId: SmartViewId;
  title: string;
  items: readonly SmartViewItem[];
  count: number;
  generatedAt: number;
  warnings: readonly string[];
};

const definitions: readonly SmartViewDefinition[] = [
  ["now", "NOW", "Şu anda en uygun görev.", "trigger order"],
  ["top-3", "Top 3", "Bugünün üç önceliği.", "trigger order"],
  ["today", "Bugün", "Bugün planlanan veya vadesi gelen işler.", "date, trigger order"],
  ["week", "Hafta", "Önümüzdeki yedi günün operasyonel işleri.", "date"],
  ["waiting", "Bekleyen", "Dış yanıt veya olay bekleyen işler.", "follow-up"],
  ["follow-up", "Takip zamanı", "Takibi gelmiş bekleyen işler.", "follow-up"],
  ["stale", "Bayat", "Mevcut staleness politikasına göre dokunulmamış işler.", "last touched"],
  ["deadline-risk", "Son tarih riski", "Mevcut risk seçicisinin getirdiği işler.", "trigger order"],
  ["blocked", "Bloklu", "Şu an ilerleyemeyen işler.", "title"],
  ["blocking", "Bloklayan", "Başka işleri açan işler.", "title"],
  ["quick-wins", "Hızlı kazanımlar", "Mevcut slot seçicisine sığan işler.", "trigger order"],
  ["office", "Ofis", "Ofis bağlamındaki işler.", "trigger order"],
  ["phone", "Telefon", "Telefon bağlamındaki işler.", "trigger order"],
  ["outside", "Dışarıda", "Dışarı bağlamındaki işler.", "trigger order"],
  ["low-energy", "Düşük enerji", "Düşük enerjiye uygun işaretlenmiş işler.", "trigger order"],
  [
    "deep-work",
    "Derin çalışma",
    "Yüksek enerji ve anlamlı odak süresi gerektiren işler.",
    "trigger order",
  ],
  ["someday", "Bir gün", "Bilerek pasifte tutulan işler.", "last touched"],
  ["completed", "Tamamlanan", "Son 30 gündeki tamamlanan işler.", "completed newest first"],
].map(([id, label, description, defaultSort]) => ({
  id: id as SmartViewId,
  label,
  description,
  domain: "EXECUTION",
  defaultSort,
}));

export const SMART_VIEW_REGISTRY = definitions;

function detail(task: ExecutionTask) {
  if (task.state === "WAITING")
    return task.waitingFor ? `Beklenen: ${task.waitingFor}` : "Takip bekleniyor";
  if (task.dueAt) return `Son tarih: ${new Date(task.dueAt).toLocaleDateString("tr-TR")}`;
  if (task.doAt) return `Yapılacak: ${new Date(task.doAt).toLocaleDateString("tr-TR")}`;
  return task.context;
}
function item(task: ExecutionTask, results: TriggerResults): SmartViewItem {
  const evaluation = results.evaluations.find((value) => value.taskId === task.id);
  return {
    entityType: "TASK",
    entityId: task.id,
    title: task.title,
    subtitle: detail(task),
    state: task.state,
    dueAt: task.dueAt,
    doAt: task.doAt,
    followUpAt: task.followUpAt,
    estimatedMinutes: task.estimatedMinutes,
    reasonCodes: evaluation?.reasons.map((reason) => reason.code) ?? [],
    actions: ["START", "DONE", "SNOOZE", "WAITING", "OPEN"],
  };
}

export function getSmartView(input: {
  viewId: SmartViewId;
  tasks: readonly ExecutionTask[];
  now: number;
  timezone: string;
  availableSlotMinutes?: number;
}): SmartViewResult {
  const context: TriggerContext = {
    now: input.now,
    timezone: input.timezone,
    availableSlotMinutes: input.availableSlotMinutes ?? 15,
  };
  const results = new TriggerEngine().evaluateTasks(input.tasks, context);
  const ordered = getNowCandidates(input.tasks, context, results);
  const inWeek = (task: ExecutionTask) =>
    [task.doAt, task.dueAt, task.followUpAt].some(
      (date) => date !== undefined && date >= input.now && date <= input.now + 7 * 86_400_000,
    );
  const primary = getBestNowTask(input.tasks, context, results);
  const select: Record<SmartViewId, readonly ExecutionTask[]> = {
    now: primary ? [primary] : [],
    "top-3": getTop3Today(input.tasks, context, results),
    today: ordered.filter(
      (task) =>
        (task.doAt && sameLocalDay(task.doAt, input.now, input.timezone)) ||
        (task.dueAt && sameLocalDay(task.dueAt, input.now, input.timezone)),
    ),
    week: ordered.filter(inWeek),
    waiting: input.tasks
      .filter((task) => task.state === "WAITING")
      .sort(
        (a, b) =>
          (a.followUpAt ?? Number.MAX_SAFE_INTEGER) - (b.followUpAt ?? Number.MAX_SAFE_INTEGER),
      ),
    "follow-up": getWaitingFollowUps(input.tasks, context),
    stale: getStaleTasks(input.tasks, context),
    "deadline-risk": getDeadlineRisks(input.tasks, context, results),
    blocked: getBlockedTasks(input.tasks),
    blocking: getBlockingTasks(input.tasks),
    "quick-wins": getQuickWins(input.tasks, context, results),
    office: ordered.filter((task) => task.context?.toUpperCase() === "OFFICE"),
    phone: ordered.filter((task) => task.context?.toUpperCase() === "PHONE"),
    outside: ordered.filter((task) => task.context?.toUpperCase() === "OUTSIDE"),
    "low-energy": ordered.filter((task) => task.energyRequirement === "LOW"),
    "deep-work": ordered.filter(
      (task) => task.energyRequirement === "HIGH" && (task.estimatedMinutes ?? 0) >= 30,
    ),
    someday: getSomedayTasks(input.tasks).sort((a, b) => a.lastTouchedAt - b.lastTouchedAt),
    completed: input.tasks
      .filter(
        (task) =>
          task.state === "DONE" &&
          task.completedAt !== undefined &&
          task.completedAt >= input.now - 30 * 86_400_000,
      )
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)),
  };
  const definition = SMART_VIEW_REGISTRY.find((value) => value.id === input.viewId)!;
  const items = select[input.viewId].map((task) => item(task, results));
  return {
    viewId: input.viewId,
    title: definition.label,
    items,
    count: items.length,
    generatedAt: input.now,
    warnings:
      input.viewId === "deep-work"
        ? ["DEEP_WORK_V1, HIGH enerji ve en az 30 dakika tahmin kullanır."]
        : [],
  };
}

export function getSmartViewCounts(input: Omit<Parameters<typeof getSmartView>[0], "viewId">) {
  return Object.fromEntries(
    SMART_VIEW_IDS.map((viewId) => [viewId, getSmartView({ ...input, viewId }).count]),
  ) as Record<SmartViewId, number>;
}
