import { describe, expect, it } from "vitest";
import { fixedClock } from "../../src/lib/architecture/clock";
import { LocalDomainEventDispatcher } from "../../src/application/events/dispatcher";
import { createTaskCommands } from "../../src/application/commands/task-commands";
import { createTaskQueries } from "../../src/application/queries/task-queries";
import type { GoalRepository } from "../../src/application/repositories/goal-repository";
import type { ProjectRepository } from "../../src/application/repositories/project-repository";
import type {
  TaskRecord,
  TaskRepository,
} from "../../src/application/repositories/task-repository";
import { LegacyTaskRepository } from "../../src/application/repositories/task-repository";
import type { Todo } from "../../src/lib/mindmap-store";

function record(id: string, done = false): TaskRecord {
  const task: Todo = { id, text: id, done, status: done ? "done" : "todo", createdAt: 1 };
  return {
    task,
    workspaceId: "ws-1",
    workspaceName: "Kişisel",
    nodeId: "node-1",
    nodeTitle: "Proje",
  };
}

function repository(): TaskRepository {
  const items = new Map<string, TaskRecord>([["task-1", record("task-1")]]);
  return {
    get: (id) => items.get(id),
    list: () => [...items.values()],
    create: ({ text }) => {
      const next = record(`task-${items.size + 1}`);
      next.task.text = text;
      items.set(next.task.id, next);
      return next;
    },
    update: (id, patch) => {
      const current = items.get(id);
      if (!current) return undefined;
      current.task = { ...current.task, ...patch };
      return current;
    },
    complete: (id) => {
      const current = items.get(id);
      if (!current) return undefined;
      current.task = { ...current.task, done: true, status: "done" };
      return current;
    },
    reopen: (id) => {
      const current = items.get(id);
      if (!current) return undefined;
      current.task = { ...current.task, done: false, status: "todo" };
      return current;
    },
    remove: (id) => items.delete(id),
  };
}

const projects: ProjectRepository = { get: () => undefined, list: () => [] };
const goals: GoalRepository = { get: () => undefined, list: () => [] };

describe("task application boundary", () => {
  it("adapts the legacy store without changing the canonical task ID", () => {
    const current = record("legacy-task");
    const legacy = {
      allTodos: () => [
        {
          wsId: current.workspaceId,
          wsName: current.workspaceName,
          nodeId: current.nodeId,
          nodeTitle: current.nodeTitle,
          todo: current.task,
        },
      ],
      addTodo: () => current.task,
      updateTodo: () => undefined,
      toggleTodo: () => true,
      removeTodo: () => undefined,
    };
    const adapter = new LegacyTaskRepository(legacy);
    expect(adapter.get("legacy-task")?.task.id).toBe("legacy-task");
    expect(adapter.create({ nodeId: "node-1", text: "Yeni" })?.task.id).toBe("legacy-task");
  });

  it("validates commands and emits minimal canonical-ID events", () => {
    const repo = repository();
    const dispatcher = new LocalDomainEventDispatcher();
    const events: string[] = [];
    dispatcher.subscribe("*", (event) => events.push(`${event.name}:${event.aggregateId}`));
    const commands = createTaskCommands({
      tasks: repo,
      clock: fixedClock(100),
      events: (event) => dispatcher.emit(event),
    });

    expect(() => commands.createTask({ nodeId: "node-1", text: "   " })).toThrow();
    commands.createTask({ nodeId: "node-1", text: "Yeni görev" });
    commands.completeTask("task-1");
    commands.updateTask("task-1", { note: "not" });

    expect(events).toEqual(["TaskCreated:task-2", "TaskCompleted:task-1", "TaskUpdated:task-1"]);
    expect(repo.get("task-1")?.task.id).toBe("task-1");
  });

  it("exposes canonical task queries without a second task collection", () => {
    const queries = createTaskQueries({ tasks: repository(), projects, goals });
    expect(queries.getAllTasks().map((entry) => entry.task.id)).toEqual(["task-1"]);
    expect(queries.getActiveTasks()).toHaveLength(1);
    expect(queries.getCompletedTasks()).toHaveLength(0);
    expect(queries.getTaskRelationships("task-1")?.taskId).toBe("task-1");
  });
});
