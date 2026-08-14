import type { Goal } from "@/lib/goal-store";
import type { Todo } from "@/lib/mindmap-store";
import type { ProjectRepository } from "../repositories/project-repository";
import type { GoalRepository } from "../repositories/goal-repository";
import type { TaskRecord, TaskRepository } from "../repositories/task-repository";

export function createTaskQueries(deps: {
  tasks: TaskRepository;
  projects: ProjectRepository;
  goals: GoalRepository;
}) {
  const all = (): TaskRecord[] => deps.tasks.list();
  return {
    getTaskById: (id: string) => deps.tasks.get(id),
    getAllTasks: all,
    getActiveTasks: () => all().filter(({ task }) => !task.done),
    getCompletedTasks: () => all().filter(({ task }) => task.done),
    getProjectById: (id: string) => deps.projects.get(id),
    getProjects: () => deps.projects.list(),
    getGoalById: (id: string): Goal | undefined => deps.goals.get(id),
    getGoals: () => deps.goals.list(),
    getTaskRelationships: (id: string) => {
      const record = deps.tasks.get(id);
      if (!record) return undefined;
      const siblings = all().filter((entry) => entry.nodeId === record.nodeId);
      return {
        taskId: id,
        parent: record.task.parentId ? deps.tasks.get(record.task.parentId) : undefined,
        children: siblings.filter((entry) => entry.task.parentId === id),
      };
    },
  };
}

export type TaskQueryApi = ReturnType<typeof createTaskQueries>;
export type TaskQueryTask = Todo;
