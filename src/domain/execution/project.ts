export type ProjectState = "ACTIVE" | "PAUSED" | "DONE" | "CANCELLED";

export type ExecutionProject = {
  id: string;
  title: string;
  goalId?: string;
  status: ProjectState;
  createdAt: number;
  updatedAt: number;
  lastTouchedAt: number;
  metadata: Record<string, unknown>;
};
