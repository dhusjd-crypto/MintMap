import type { DailyPlan, PlanDiff, PlannerInput, TimeBlock } from "@/domain/planning";
import { plannerEngine } from "./engine";
import { resolvePlanningConfig } from "./config";
import { mergeWindows } from "./windows";

export function effectiveLockState(
  block: TimeBlock,
  now: number,
  horizonHours: number,
): TimeBlock["lockState"] {
  if (block.lockState === "LOCKED") return "LOCKED";
  if (block.startAt - now <= horizonHours * 3_600_000) return "LOCKED";
  return block.lockState === "SOFT_LOCKED" ? "SOFT_LOCKED" : "UNLOCKED";
}

function blockIntersectsWindow(
  block: TimeBlock,
  windows: ReturnType<typeof mergeWindows>["segments"],
) {
  return windows.some((window) => block.startAt < window.endAt && block.endAt > window.startAt);
}

export function replanDay(input: PlannerInput): {
  result: ReturnType<typeof plannerEngine.planDay>;
  diff: PlanDiff;
} {
  const previous = input.previousPlan;
  const horizonHours = resolvePlanningConfig(input.config).lockHorizon.nextHours;
  const windows = mergeWindows(input.windows).segments;
  const existingBlocks = (input.existingBlocks ?? []).filter((block) => {
    if (block.status === "COMPLETED" || block.status === "ACTIVE") return true;
    if (block.type !== "TASK") return true;
    if (effectiveLockState(block, input.now, horizonHours) === "LOCKED") return true;
    return blockIntersectsWindow(block, windows);
  });
  const result = plannerEngine.planDay({ ...input, existingBlocks });
  const oldBlocks = previous?.timeBlocks ?? [];
  const nextBlocks = result.dailyPlan.timeBlocks;
  const oldById = new Map(oldBlocks.map((block) => [block.id, block]));
  const nextById = new Map(nextBlocks.map((block) => [block.id, block]));
  const preserved: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];
  const moved: string[] = [];
  for (const block of nextBlocks) {
    const old = oldById.get(block.id);
    if (!old) added.push(block.id);
    else if (old.startAt !== block.startAt || old.endAt !== block.endAt) moved.push(block.id);
    else preserved.push(block.id);
  }
  for (const block of oldBlocks) if (!nextById.has(block.id)) removed.push(block.id);
  const warnings = [...result.warnings];
  for (const block of oldBlocks.filter(
    (item) => effectiveLockState(item, input.now, horizonHours) === "LOCKED",
  ))
    if (!nextById.has(block.id))
      warnings.push({
        code: "LOCKED_BLOCK_CONFLICT",
        message: `Kilitli blok korunamadı: ${block.id}`,
      });
  return {
    result,
    diff: {
      preservedBlockIds: preserved,
      addedBlockIds: added,
      removedBlockIds: removed,
      movedBlockIds: moved,
      warnings,
    },
  };
}
