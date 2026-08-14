import { goals, type Goal } from "@/lib/goal-store";

export interface GoalRepository {
  get(id: string): Goal | undefined;
  list(): Goal[];
}

export class LegacyGoalRepository implements GoalRepository {
  list(): Goal[] {
    return goals.list();
  }

  get(id: string): Goal | undefined {
    return goals.get(id);
  }
}
