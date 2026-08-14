import { taskApplication } from "@/application/task-application";
import { systemClock } from "@/lib/architecture/clock";
import { ReviewRepository } from "@/application/repositories/review-repository";
import {
  ROUTINE_MODEL_VERSION,
  type RolloverDecisionType,
  type RoutineSession,
  type RoutineType,
} from "@/domain/review";

export const reviewApplication = {
  repository: new ReviewRepository(),
  commands: {
    async start(type: RoutineType, localDate: string) {
      const now = systemClock.nowMs();
      const id = `${type}:${localDate}`;
      const existing = await reviewApplication.repository.getSession(id);
      if (existing?.status === "COMPLETED" || existing?.status === "SKIPPED") return existing;
      const value: RoutineSession = {
        id,
        type,
        localDate,
        status: "ACTIVE",
        startedAt: now,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        modelVersion: ROUTINE_MODEL_VERSION,
      };
      await reviewApplication.repository.saveSession(value);
      return value;
    },
    async complete(
      type: RoutineType,
      localDate: string,
      stepResults?: RoutineSession["stepResults"],
    ) {
      const now = systemClock.nowMs();
      const id = `${type}:${localDate}`;
      const existing = await reviewApplication.repository.getSession(id);
      const value: RoutineSession = {
        id,
        type,
        localDate,
        status: "COMPLETED",
        startedAt: existing?.startedAt ?? now,
        completedAt: now,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        modelVersion: ROUTINE_MODEL_VERSION,
        stepResults,
      };
      await reviewApplication.repository.saveSession(value);
      return value;
    },
    async skip(type: RoutineType, localDate: string) {
      const now = systemClock.nowMs();
      const value: RoutineSession = {
        id: `${type}:${localDate}`,
        type,
        localDate,
        status: "SKIPPED",
        createdAt: now,
        updatedAt: now,
        modelVersion: ROUTINE_MODEL_VERSION,
      };
      await reviewApplication.repository.saveSession(value);
      return value;
    },
    recordRollover(
      taskId: string,
      fromDate: string,
      decision: RolloverDecisionType,
      targetDate?: string,
      reason?: string,
    ) {
      const now = systemClock.nowMs();
      return reviewApplication.repository
        .saveRollover({
          id: `${taskId}:${fromDate}:${decision}:${targetDate ?? ""}`,
          taskId,
          fromDate,
          decision,
          targetDate,
          reason,
          createdAt: now,
          modelVersion: ROUTINE_MODEL_VERSION,
        })
        .then(() => {
          if (decision === "MOVE_TO_TOMORROW" && targetDate) {
            const target = Date.parse(`${targetDate}T09:00:00Z`);
            taskApplication.commands.setTaskDates(taskId, { doAt: target });
          }
          if (decision === "WAITING" && reason) taskApplication.commands.setWaiting(taskId, reason);
          return reviewApplication.repository.listRollovers();
        });
    },
  },
};
