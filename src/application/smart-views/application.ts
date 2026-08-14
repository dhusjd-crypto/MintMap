import { taskApplication } from "@/application/task-application";
import { CanonicalExecutionTaskRepository } from "@/application/repositories/canonical-execution-repository";
import { completeTask, snoozeTask, startTask } from "@/domain/execution/task";
import { systemClock, type Clock } from "@/lib/architecture/clock";
import { getSmartView, getSmartViewCounts, type SmartViewId } from "./index";

const repository = new CanonicalExecutionTaskRepository(taskApplication.repositories.tasks);

export const smartViewsApplication = {
  queries: {
    async getView(input: {
      viewId: SmartViewId;
      now: number;
      timezone: string;
      availableSlotMinutes?: number;
    }) {
      const records = await repository.list();
      return getSmartView({ ...input, tasks: records.map((record) => record.canonical) });
    },
    async getCounts(input: { now: number; timezone: string; availableSlotMinutes?: number }) {
      const records = await repository.list();
      return getSmartViewCounts({ ...input, tasks: records.map((record) => record.canonical) });
    },
  },
  commands: {
    async start(taskId: string, clock: Clock = systemClock) {
      const current = await repository.get(taskId);
      if (!current) throw new Error("Görev bulunamadı.");
      return repository.save(startTask(current.canonical, clock));
    },
    async done(taskId: string, clock: Clock = systemClock) {
      const current = await repository.get(taskId);
      if (!current) throw new Error("Görev bulunamadı.");
      return repository.save(completeTask(current.canonical, clock));
    },
    async snooze(taskId: string, minutes: number, clock: Clock = systemClock) {
      const current = await repository.get(taskId);
      if (!current) throw new Error("Görev bulunamadı.");
      return repository.save(
        snoozeTask(current.canonical, clock.nowMs() + minutes * 60_000, clock),
      );
    },
  },
};
