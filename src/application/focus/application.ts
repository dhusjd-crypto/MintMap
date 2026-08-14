import { systemClock } from "@/lib/architecture/clock";
import { taskApplication } from "../task-application";
import { FocusSessionRepository } from "../repositories/focus-session-repository";
import { FocusSessionService } from "./focus-service";

export const focusApplication = new FocusSessionService({
  clock: systemClock,
  repository: new FocusSessionRepository(),
  onTimeRecorded: async (taskId, minutes) => {
    const record = taskApplication.repositories.tasks.get(taskId);
    if (!record) return;
    taskApplication.commands.updateTask(taskId, {
      focusedMin: (record.task.focusedMin ?? 0) + minutes,
    });
  },
});
