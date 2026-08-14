import { taskApplication } from "./task-application";
import { systemClock } from "@/lib/architecture/clock";

export const executionExperience = {
  commands: {
    start: (taskId: string) => taskApplication.commands.startTask(taskId),
    done: (taskId: string) => taskApplication.commands.completeTask(taskId),
    snooze: (taskId: string, minutes: number) =>
      taskApplication.commands.snoozeTask(taskId, systemClock.nowMs() + minutes * 60_000),
    moveToWaiting: (taskId: string, waitingFor: string, followUpAt?: number) =>
      taskApplication.commands.setWaiting(taskId, waitingFor, followUpAt),
    cannotDoToday: () => ({
      status: "REQUIRES_DECISION" as const,
      message: "Görevin tarihini veya durumunu değiştirmek için bir seçenek seçin.",
    }),
  },
};
