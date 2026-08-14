import type {
  DailyCapacity,
  PlanningConfig,
  PlanningWindow,
  TimeBlock,
  DeadlinePlanningRisk,
} from "@/domain/planning";
import { mergeWindows, subtractBlocks, totalMinutes } from "./windows";

export function bufferMinutes(availableMinutes: number, config: PlanningConfig) {
  if (config.bufferPolicy.kind === "NONE") return 0;
  if (config.bufferPolicy.kind === "FIXED_MINUTES")
    return Math.min(availableMinutes, Math.max(0, config.bufferPolicy.minutes));
  return Math.min(
    availableMinutes,
    Math.round((availableMinutes * Math.max(0, config.bufferPolicy.percentage)) / 100),
  );
}
export function calculateDailyCapacity(input: {
  windows: readonly PlanningWindow[];
  blocks: readonly TimeBlock[];
  config: PlanningConfig;
  risks?: readonly DeadlinePlanningRisk[];
}): DailyCapacity {
  const merged = mergeWindows(input.windows);
  const availableMinutes = totalMinutes(merged.segments);
  const fixedBlocks = input.blocks.filter(
    (block) => block.type === "FIXED_EVENT" || block.type === "BREAK" || block.type === "BUFFER",
  );
  const fixedMinutes =
    totalMinutes(subtractBlocks(merged.segments, [])) -
    totalMinutes(subtractBlocks(merged.segments, fixedBlocks));
  const taskBlocks = input.blocks.filter(
    (block) => block.type === "TASK" || block.type === "FOCUS" || block.type === "MANUAL",
  );
  const plannedTaskMinutes = taskBlocks.reduce((sum, block) => sum + block.durationMinutes, 0);
  const buffers = bufferMinutes(Math.max(0, availableMinutes - fixedMinutes), input.config);
  const usable = Math.max(0, availableMinutes - fixedMinutes - buffers);
  const overcommitMinutes = Math.max(0, plannedTaskMinutes - usable);
  const remainingMinutes = Math.max(0, usable - plannedTaskMinutes);
  const utilizationRatio = usable > 0 ? plannedTaskMinutes / usable : undefined;
  const last = taskBlocks
    .filter((block) => block.status !== "CANCELLED")
    .sort((a, b) => b.endAt - a.endAt)[0];
  return {
    availableMinutes,
    fixedMinutes,
    bufferMinutes: buffers,
    plannedTaskMinutes,
    remainingMinutes,
    overcommitMinutes,
    utilizationRatio,
    estimatedFinishTime: overcommitMinutes === 0 ? last?.endAt : undefined,
    tasksAtRisk: input.risks ?? [],
    warnings: [
      ...(merged.segments.length === 0
        ? [
            {
              code: "INSUFFICIENT_CONTEXT" as const,
              message: "Planlama için açık zaman penceresi verilmedi.",
            },
          ]
        : []),
      ...(merged.overlapping
        ? [
            {
              code: "OVERLAPPING_WINDOWS" as const,
              message: "Çakışan pencereler tek kapasite olarak birleştirildi.",
            },
          ]
        : []),
      ...(overcommitMinutes > 0
        ? [
            {
              code: "OVERCOMMITTED" as const,
              message: `${overcommitMinutes} dakika kapasite aşımı var.`,
              metadata: { overcommitMinutes },
            },
          ]
        : []),
    ],
  };
}
