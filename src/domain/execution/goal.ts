export type GoalState = "ACTIVE" | "PAUSED" | "DONE" | "CANCELLED";

export type ExecutionGoal = {
  id: string;
  title: string;
  status: GoalState;
  strategicWeight?: number;
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, unknown>;
};
