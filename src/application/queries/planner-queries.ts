import type { PlanningCandidate, PlannerInput, PlanResult } from "@/engines/planner";
import { plannerEngine, replanDay } from "@/engines/planner";
import type { TriggerContext } from "@/engines/trigger";

export function createPlannerQueries() {
  return {
    planDay: (input: PlannerInput): PlanResult => plannerEngine.planDay(input),
    replanDay: (input: PlannerInput) => replanDay(input),
    toTriggerContext: (
      result: PlanResult,
      base: Pick<TriggerContext, "now" | "timezone">,
    ): TriggerContext => ({
      ...base,
      availableMinutesToday:
        result.capacity.availableMinutes -
        result.capacity.fixedMinutes -
        result.capacity.bufferMinutes,
      plannedMinutesToday: result.capacity.plannedTaskMinutes,
      overcommitMinutes: result.capacity.overcommitMinutes,
      planningRisks: result.capacity.tasksAtRisk,
      scheduleChanged: {
        verified: true,
        requiresReplan: result.dailyPlan.revision > 1,
        reason: "Planner günlük planı hesapladı.",
      },
    }),
  };
}

export type PlannerQueryApi = ReturnType<typeof createPlannerQueries>;
export type { PlanningCandidate };
