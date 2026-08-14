import type {
  DailyPlan,
  DeadlinePlanningRisk,
  PlanResult,
  PlannerInput,
  TimeBlock,
} from "@/domain/planning";
import { resolvePlanningConfig } from "./config";
import { calculateDailyCapacity, bufferMinutes } from "./capacity";
import { calculateDeadlineRisk } from "./risk";
import { scheduleCandidates } from "./scheduling";

export class PlannerEngine {
  planDay(input: PlannerInput): PlanResult {
    const config = resolvePlanningConfig(input.config);
    const existing = input.existingBlocks ?? [];
    const fixed = input.fixedBlocks ?? [];
    const occupied = [...existing, ...fixed];
    const risks: DeadlinePlanningRisk[] = [];
    for (const candidate of input.candidates) {
      const risk = calculateDeadlineRisk(candidate, input.windows, occupied, config, input.now);
      if (risk) risks.push(risk);
    }
    const scheduled = scheduleCandidates({
      now: input.now,
      candidates: input.candidates,
      windows: input.windows,
      existingBlocks: existing,
      fixedBlocks: fixed,
      config,
    });
    const capacity = calculateDailyCapacity({
      windows: input.windows,
      blocks: scheduled.blocks,
      config,
      risks,
    });
    const movable = scheduled.blocks
      .filter(
        (block) => block.taskId && block.lockState === "UNLOCKED" && block.status === "PLANNED",
      )
      .sort((a, b) => a.startAt - b.startAt || a.id.localeCompare(b.id))
      .map((block) => block.taskId!);
    const dailyPlan: DailyPlan = {
      id: input.previousPlan?.id ?? `plan:${input.localDate}:${input.timezone}`,
      localDate: input.localDate,
      timezone: input.timezone,
      timeBlocks: scheduled.blocks,
      createdAt: input.previousPlan?.createdAt ?? input.now,
      updatedAt: input.now,
      status: input.previousPlan?.status ?? "DRAFT",
      revision: (input.previousPlan?.revision ?? 0) + 1,
    };
    return {
      dailyPlan,
      capacity,
      overcommit: {
        overcommitMinutes: capacity.overcommitMinutes,
        movableTaskIds: [...new Set(movable)],
        reason: capacity.overcommitMinutes ? "OVERCOMMITTED" : "WITHIN_CAPACITY",
      },
      scheduled: scheduled.scheduled,
      unscheduled: scheduled.unscheduled,
      warnings: capacity.warnings,
      generatedAt: input.now,
      plannerModelVersion: config.version,
    };
  }
}
export const plannerEngine = new PlannerEngine();
