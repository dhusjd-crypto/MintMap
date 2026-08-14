import {
  DEFAULT_PLANNING_CONFIG,
  PLANNER_MODEL_VERSION,
  type PlannerInput,
  type PlanningConfig,
} from "@/domain/planning";

export function resolvePlanningConfig(input: PlannerInput["config"] = {}): PlanningConfig {
  return {
    ...DEFAULT_PLANNING_CONFIG,
    ...input,
    version: PLANNER_MODEL_VERSION,
    bufferPolicy: input.bufferPolicy ?? DEFAULT_PLANNING_CONFIG.bufferPolicy,
    lockHorizon: { ...DEFAULT_PLANNING_CONFIG.lockHorizon, ...(input.lockHorizon ?? {}) },
  };
}
