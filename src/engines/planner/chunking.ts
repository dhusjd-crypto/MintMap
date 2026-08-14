import { PLANNER_REASON_CODES } from "./reasons";

export type ChunkingInput = {
  remainingMinutes: number;
  splittable?: boolean;
  minChunkMinutes?: number;
  maxChunkMinutes?: number;
  availableSegmentMinutes: readonly number[];
};
export type ChunkingResult = { chunks: readonly number[]; reasonCode?: string };
function canFit(chunks: readonly number[], segments: readonly number[]): boolean {
  let segmentIndex = 0;
  let remaining = segments[0] ?? 0;
  for (const chunk of chunks) {
    while (segmentIndex < segments.length && remaining < chunk) {
      segmentIndex++;
      remaining = segments[segmentIndex] ?? 0;
    }
    if (segmentIndex >= segments.length) return false;
    remaining -= chunk;
  }
  return true;
}
export function chunkTask(input: ChunkingInput): ChunkingResult {
  const total = Math.max(0, Math.floor(input.remainingMinutes));
  if (total === 0) return { chunks: [] };
  const largest = Math.max(0, ...input.availableSegmentMinutes);
  if (input.splittable !== true)
    return largest >= total ? { chunks: [total] } : { chunks: [], reasonCode: "DOES_NOT_FIT" };
  const min = Math.max(1, input.minChunkMinutes ?? 1);
  const max = Math.max(min, input.maxChunkMinutes ?? total);
  for (let count = Math.max(1, Math.ceil(total / max)); count <= Math.floor(total / min); count++) {
    const base = Math.floor(total / count);
    const remainder = total % count;
    const chunks = Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
    if (
      chunks.every((value) => value >= min && value <= max) &&
      canFit(chunks, input.availableSegmentMinutes)
    )
      return { chunks };
  }
  return { chunks: [], reasonCode: PLANNER_REASON_CODES.UNSCHEDULED_NO_FIT };
}
