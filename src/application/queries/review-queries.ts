import { legacyTaskToDomainTask } from "@/application/mapping/execution-task-mapping";
import { createReviewEngine } from "@/engines/review";
import type { PlanResult } from "@/domain/planning";
import type { FocusSession } from "@/domain/focus";
import type { RoutineSession, RoutineType } from "@/domain/review";
import type { TaskRecord } from "@/application/repositories/task-repository";

export function createReviewQueries(input: {
  listTasks: () => TaskRecord[];
  listSessions?: () => Promise<RoutineSession[]>;
}) {
  const engine = createReviewEngine();
  const tasks = () =>
    input
      .listTasks()
      .map((record) => legacyTaskToDomainTask(record.task, { projectId: record.nodeId }));
  return {
    getSummary(
      type: RoutineType,
      now: number,
      timezone: string,
      capacity?: PlanResult["capacity"],
      focus?: FocusSession,
    ) {
      const all = tasks();
      if (type === "MORNING_PLANNING") {
        const result = engine.getMorning(all, now, timezone, capacity);
        return {
          type,
          localDate: result.localDate,
          title: "Güne başla",
          primaryItems: result.leftovers,
          secondaryItems: [...result.dueFollowUps, ...result.deadlineRisks],
          warnings: result.warnings,
          capacity: result.capacity,
          recommendedAction: "PLAN" as const,
          top3: result.top3,
        };
      }
      if (type === "MIDDAY_RECALIBRATION") return engine.getMidday(all, now, timezone, capacity);
      if (type === "EVENING_SHUTDOWN")
        return engine.getShutdown(all, now, timezone, focus, capacity);
      if (type === "TOMORROW_PLANNING") return engine.getTomorrow(all, now, timezone, capacity);
      if (type === "WEEK_AHEAD_PLANNING")
        return engine.getTomorrow(all, now + 7 * 86_400_000, timezone, capacity);
      if (type === "REENTRY_RESET") return engine.getReentry(all, now, timezone, capacity);
      return engine.getWeekly(all, now, timezone, capacity);
    },
    async getLastSession(type: RoutineType, localDate: string) {
      const sessions = (await input.listSessions?.()) ?? [];
      return sessions.find((session) => session.type === type && session.localDate === localDate);
    },
  };
}
