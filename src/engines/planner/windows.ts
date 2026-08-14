import type { PlanningWindow, TimeBlock } from "@/domain/planning";

export type Segment = { startAt: number; endAt: number };
export function mergeWindows(windows: readonly PlanningWindow[]): {
  segments: Segment[];
  overlapping: boolean;
} {
  const sorted = [...windows]
    .filter((window) => window.endAt > window.startAt)
    .sort((a, b) => a.startAt - b.startAt || a.id.localeCompare(b.id));
  const segments: Segment[] = [];
  let overlapping = false;
  for (const window of sorted) {
    const last = segments.at(-1);
    if (last && window.startAt <= last.endAt) {
      overlapping = true;
      last.endAt = Math.max(last.endAt, window.endAt);
    } else segments.push({ startAt: window.startAt, endAt: window.endAt });
  }
  return { segments, overlapping };
}
export function subtractBlocks(
  segments: readonly Segment[],
  blocks: readonly TimeBlock[],
): Segment[] {
  let result = [...segments];
  for (const block of blocks.filter(
    (item) => item.status !== "CANCELLED" && item.endAt > item.startAt,
  )) {
    const next: Segment[] = [];
    for (const segment of result) {
      if (block.endAt <= segment.startAt || block.startAt >= segment.endAt) next.push(segment);
      else {
        if (segment.startAt < block.startAt)
          next.push({ startAt: segment.startAt, endAt: block.startAt });
        if (block.endAt < segment.endAt) next.push({ startAt: block.endAt, endAt: segment.endAt });
      }
    }
    result = next.filter((segment) => segment.endAt > segment.startAt);
  }
  return result;
}
export function durationMinutes(segment: Segment) {
  return Math.max(0, Math.floor((segment.endAt - segment.startAt) / 60_000));
}
export function totalMinutes(segments: readonly Segment[]) {
  return segments.reduce((sum, segment) => sum + durationMinutes(segment), 0);
}
