import { createDomainEvent, type DomainEventSink } from "@/lib/architecture/domain-events";
import { systemClock, type Clock } from "@/lib/architecture/clock";
import { isFeatureEnabled } from "@/lib/architecture/feature-flags";
import type { Todo } from "@/lib/mindmap-store";
import {
  completeTask as completeDomainTask,
  startTask as startDomainTask,
  reopenTask as reopenDomainTask,
  setTaskDates as setDomainTaskDates,
  setTaskReminder as setDomainTaskReminder,
  snoozeTask as snoozeDomainTask,
  setWaiting as setDomainWaiting,
  resumeWaiting as resumeDomainWaiting,
  updateTaskDetails,
  moveTaskState,
  validateTask,
} from "@/domain/execution/task";
import {
  domainTaskToLegacyPatch,
  legacyPatchToDomainPatch,
  legacyTaskToDomainTask,
} from "../mapping/execution-task-mapping";
import type { TaskRepository, TaskRecord, CreateTaskInput } from "../repositories/task-repository";

export type TaskApplicationDependencies = {
  tasks: TaskRepository;
  clock?: Clock;
  events?: DomainEventSink;
};

function emit(
  deps: TaskApplicationDependencies,
  name: Parameters<typeof createDomainEvent>[0]["name"],
  task: TaskRecord,
) {
  if (!isFeatureEnabled("domainEventsV1")) return;
  deps.events?.(
    createDomainEvent({
      name,
      aggregateId: task.task.id,
      occurredAt: (deps.clock ?? systemClock).nowMs(),
      payload: { taskId: task.task.id },
    }),
  );
}

export function createTaskCommands(deps: TaskApplicationDependencies) {
  return {
    createTask(input: CreateTaskInput): TaskRecord {
      const text = input.text.trim();
      if (!text) throw new Error("Görev metni boş olamaz.");
      const created = deps.tasks.create({ ...input, text });
      if (!created) throw new Error("Görev oluşturulamadı.");
      validateTask(legacyTaskToDomainTask(created.task, { projectId: created.nodeId }));
      emit(deps, "TaskCreated", created);
      return created;
    },

    updateTask(id: string, patch: Partial<Todo>): TaskRecord {
      const current = deps.tasks.get(id);
      if (!current) throw new Error("Görev bulunamadı.");
      const domainPatch = legacyPatchToDomainPatch(patch);
      const detailPatch = { ...domainPatch };
      delete detailPatch.state;
      let next = updateTaskDetails(
        legacyTaskToDomainTask(current.task, { projectId: current.nodeId }),
        detailPatch,
        deps.clock ?? systemClock,
      );
      if (domainPatch.state && domainPatch.state !== next.state) {
        next = moveTaskState(next, domainPatch.state, deps.clock ?? systemClock);
      }
      const updated = deps.tasks.update(id, domainTaskToLegacyPatch(next, current.task));
      if (!updated) throw new Error("Görev bulunamadı.");
      emit(deps, "TaskUpdated", updated);
      return updated;
    },

    completeTask(id: string): TaskRecord {
      const current = deps.tasks.get(id);
      if (!current) throw new Error("Görev bulunamadı.");
      const domain = legacyTaskToDomainTask(current.task, { projectId: current.nodeId });
      if (domain.state === "DONE") return current;
      const next = completeDomainTask(domain, deps.clock ?? systemClock);
      const completed = deps.tasks.update(id, domainTaskToLegacyPatch(next, current.task));
      if (!completed) throw new Error("Görev bulunamadı.");
      emit(deps, "TaskCompleted", completed);
      return completed;
    },

    startTask(id: string): TaskRecord {
      const current = deps.tasks.get(id);
      if (!current) throw new Error("Görev bulunamadı.");
      const next = startDomainTask(
        legacyTaskToDomainTask(current.task, { projectId: current.nodeId }),
        deps.clock ?? systemClock,
      );
      const started = deps.tasks.update(id, domainTaskToLegacyPatch(next, current.task));
      if (!started) throw new Error("Görev bulunamadı.");
      emit(deps, "TaskStarted", started);
      return started;
    },

    reopenTask(id: string): TaskRecord {
      const current = deps.tasks.get(id);
      if (!current) throw new Error("Görev bulunamadı.");
      const domain = legacyTaskToDomainTask(current.task, { projectId: current.nodeId });
      if (domain.state !== "DONE") return current;
      const next = reopenDomainTask(domain, deps.clock ?? systemClock);
      const reopened = deps.tasks.update(id, domainTaskToLegacyPatch(next, current.task));
      if (!reopened) throw new Error("Görev bulunamadı.");
      emit(deps, "TaskReopened", reopened);
      return reopened;
    },

    setTaskDates(
      id: string,
      dates: {
        startAt?: number;
        doAt?: number;
        softEndAt?: number;
        dueAt?: number;
        followUpAt?: number;
      },
    ): TaskRecord {
      const current = deps.tasks.get(id);
      if (!current) throw new Error("Görev bulunamadı.");
      const domain = legacyTaskToDomainTask(current.task, { projectId: current.nodeId });
      const next = setDomainTaskDates(domain, dates, deps.clock ?? systemClock);
      const updated = deps.tasks.update(id, domainTaskToLegacyPatch(next, current.task));
      if (!updated) throw new Error("Görev bulunamadı.");
      emit(deps, "TaskUpdated", updated);
      return updated;
    },

    setTaskReminder(id: string, remindAt: number | undefined): TaskRecord {
      const current = deps.tasks.get(id);
      if (!current) throw new Error("Görev bulunamadı.");
      const domain = legacyTaskToDomainTask(current.task, { projectId: current.nodeId });
      const next = setDomainTaskReminder(domain, remindAt, deps.clock ?? systemClock);
      const updated = deps.tasks.update(id, domainTaskToLegacyPatch(next, current.task));
      if (!updated) throw new Error("Görev bulunamadı.");
      emit(deps, "TaskUpdated", updated);
      return updated;
    },

    snoozeTask(id: string, remindAt: number): TaskRecord {
      const current = deps.tasks.get(id);
      if (!current) throw new Error("Görev bulunamadı.");
      const domain = legacyTaskToDomainTask(current.task, { projectId: current.nodeId });
      const next = snoozeDomainTask(domain, remindAt, deps.clock ?? systemClock);
      const updated = deps.tasks.update(id, domainTaskToLegacyPatch(next, current.task));
      if (!updated) throw new Error("Görev bulunamadı.");
      emit(deps, "TaskSnoozed", updated);
      return updated;
    },

    setWaiting(id: string, waitingFor: string, followUpAt?: number): TaskRecord {
      const current = deps.tasks.get(id);
      if (!current) throw new Error("Görev bulunamadı.");
      const domain = legacyTaskToDomainTask(current.task, { projectId: current.nodeId });
      const next = setDomainWaiting(domain, waitingFor, deps.clock ?? systemClock, followUpAt);
      const updated = deps.tasks.update(id, domainTaskToLegacyPatch(next, current.task));
      if (!updated) throw new Error("Görev bulunamadı.");
      emit(deps, "TaskBecameWaiting", updated);
      return updated;
    },

    resumeWaiting(id: string): TaskRecord {
      const current = deps.tasks.get(id);
      if (!current) throw new Error("Görev bulunamadı.");
      const domain = legacyTaskToDomainTask(current.task, { projectId: current.nodeId });
      const next = resumeDomainWaiting(domain, deps.clock ?? systemClock);
      const updated = deps.tasks.update(id, domainTaskToLegacyPatch(next, current.task));
      if (!updated) throw new Error("Görev bulunamadı.");
      emit(deps, "TaskBecameReady", updated);
      return updated;
    },

    deleteTask(id: string): void {
      if (!deps.tasks.remove(id)) throw new Error("Görev bulunamadı.");
      if (!isFeatureEnabled("domainEventsV1")) return;
      const occurredAt = (deps.clock ?? systemClock).nowMs();
      deps.events?.(
        createDomainEvent({
          name: "TaskCancelled",
          aggregateId: id,
          occurredAt,
          payload: { taskId: id },
        }),
      );
    },
  };
}
