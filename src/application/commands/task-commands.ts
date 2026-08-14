import { createDomainEvent, type DomainEventSink } from "@/lib/architecture/domain-events";
import { systemClock, type Clock } from "@/lib/architecture/clock";
import { isFeatureEnabled } from "@/lib/architecture/feature-flags";
import type { Todo } from "@/lib/mindmap-store";
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
      emit(deps, "TaskCreated", created);
      return created;
    },

    updateTask(id: string, patch: Partial<Todo>): TaskRecord {
      const updated = deps.tasks.update(id, patch);
      if (!updated) throw new Error("Görev bulunamadı.");
      emit(deps, "TaskUpdated", updated);
      return updated;
    },

    completeTask(id: string): TaskRecord {
      const completed = deps.tasks.complete(id);
      if (!completed) throw new Error("Görev bulunamadı.");
      emit(deps, "TaskCompleted", completed);
      return completed;
    },

    reopenTask(id: string): TaskRecord {
      const reopened = deps.tasks.reopen(id);
      if (!reopened) throw new Error("Görev bulunamadı.");
      emit(deps, "TaskReopened", reopened);
      return reopened;
    },

    deleteTask(id: string): void {
      if (!deps.tasks.remove(id)) throw new Error("Görev bulunamadı.");
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
