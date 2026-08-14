import { mindmap, type Todo } from "@/lib/mindmap-store";

export type TaskRecord = {
  task: Todo;
  workspaceId: string;
  workspaceName: string;
  nodeId: string;
  nodeTitle: string;
};

export type CreateTaskInput = {
  nodeId: string;
  text: string;
  parentId?: string | null;
  extra?: Partial<Todo>;
};

export interface TaskRepository {
  get(id: string): TaskRecord | undefined;
  list(): TaskRecord[];
  create(input: CreateTaskInput): TaskRecord | undefined;
  update(id: string, patch: Partial<Todo>): TaskRecord | undefined;
  complete(id: string): TaskRecord | undefined;
  reopen(id: string): TaskRecord | undefined;
  remove(id: string): boolean;
}

type LegacyTaskStore = Pick<
  typeof mindmap,
  "allTodos" | "addTodo" | "updateTodo" | "toggleTodo" | "removeTodo"
>;

/** Compatibility adapter over the existing workspace/node/todo store. */
export class LegacyTaskRepository implements TaskRepository {
  constructor(private readonly legacyStore: LegacyTaskStore = mindmap) {}

  list(): TaskRecord[] {
    return this.legacyStore.allTodos().map((entry) => ({
      task: entry.todo,
      workspaceId: entry.wsId,
      workspaceName: entry.wsName,
      nodeId: entry.nodeId,
      nodeTitle: entry.nodeTitle,
    }));
  }

  get(id: string): TaskRecord | undefined {
    return this.list().find((entry) => entry.task.id === id);
  }

  create(input: CreateTaskInput): TaskRecord | undefined {
    const task = this.legacyStore.addTodo(
      input.nodeId,
      input.text,
      input.parentId ?? null,
      input.extra,
    );
    return task ? this.get(task.id) : undefined;
  }

  update(id: string, patch: Partial<Todo>): TaskRecord | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    this.legacyStore.updateTodo(current.nodeId, id, patch);
    return this.get(id);
  }

  complete(id: string): TaskRecord | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    if (!current.task.done) this.legacyStore.toggleTodo(current.nodeId, id);
    return this.get(id);
  }

  reopen(id: string): TaskRecord | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    if (current.task.done) this.legacyStore.toggleTodo(current.nodeId, id);
    return this.get(id);
  }

  remove(id: string): boolean {
    const current = this.get(id);
    if (!current) return false;
    this.legacyStore.removeTodo(current.nodeId, id);
    return true;
  }
}
