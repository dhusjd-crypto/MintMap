/**
 * Unit tests for the FAB slot overlap-avoidance algorithm.
 *
 * Verifies pure layout behaviour without React: register multiple
 * FABs into the store, then inspect the layouts emitted by
 * `_debugFabSnapshot()` to assert side anchoring, priority stacking,
 * gap distance, and that no two FABs on the same side overlap.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  BOTTOM_NAV_OFFSET,
  _debugFabSnapshot,
  registerFab,
  unregisterFab,
  type FabRegistration,
} from "@/lib/fab-slots";

const GAP = 12;

function reset() {
  for (const reg of _debugFabSnapshot().registry) {
    unregisterFab(reg.id);
  }
}

function layoutsById() {
  return Object.fromEntries(_debugFabSnapshot().layouts);
}

function reg(over: Partial<FabRegistration> & { id: string }): FabRegistration {
  return {
    preferredSide: "right",
    height: 48,
    width: 48,
    priority: 5,
    ...over,
  };
}

function aabbOverlap(a: { x: [number, number]; y: [number, number] }, b: typeof a) {
  return a.x[1] > b.x[0] && b.x[1] > a.x[0] && a.y[1] > b.y[0] && b.y[1] > a.y[0];
}

afterEach(reset);

describe("fab-slots", () => {
  it("anchors a single FAB to the BottomNav offset on its preferred side", () => {
    registerFab(reg({ id: "ai-launcher", preferredSide: "right" }));
    const layouts = layoutsById();
    expect(layouts["ai-launcher"]).toEqual({ side: "right", bottom: BOTTOM_NAV_OFFSET });
  });

  it("stacks FABs on the same side from the bottom up with GAP", () => {
    registerFab(reg({ id: "ai-launcher", preferredSide: "right", height: 48, priority: 2 }));
    registerFab(reg({ id: "pomodoro", preferredSide: "right", height: 44, priority: 3 }));
    const l = layoutsById();
    expect(l["ai-launcher"]).toEqual({ side: "right", bottom: BOTTOM_NAV_OFFSET });
    expect(l["pomodoro"]).toEqual({
      side: "right",
      bottom: BOTTOM_NAV_OFFSET + 48 + GAP,
    });
  });

  it("respects priority ordering regardless of registration order", () => {
    registerFab(reg({ id: "pomodoro", preferredSide: "right", height: 44, priority: 3 }));
    registerFab(reg({ id: "ai-launcher", preferredSide: "right", height: 48, priority: 2 }));
    const l = layoutsById();
    // Lower priority anchors closer to the bottom.
    expect(l["ai-launcher"].bottom).toBeLessThan(l["pomodoro"].bottom);
  });

  it("keeps left- and right-side FABs in independent stacks", () => {
    registerFab(reg({ id: "wrench", preferredSide: "left", height: 110, priority: 1 }));
    registerFab(reg({ id: "ai-launcher", preferredSide: "right", height: 48, priority: 2 }));
    const l = layoutsById();
    expect(l["wrench"].side).toBe("left");
    expect(l["ai-launcher"].side).toBe("right");
    expect(l["wrench"].bottom).toBe(BOTTOM_NAV_OFFSET);
    expect(l["ai-launcher"].bottom).toBe(BOTTOM_NAV_OFFSET);
  });

  it("produces non-overlapping rectangles on the same side", () => {
    registerFab(reg({ id: "ctx", preferredSide: "right", height: 160, priority: 0 }));
    registerFab(reg({ id: "ai-launcher", preferredSide: "right", height: 48, priority: 2 }));
    registerFab(reg({ id: "pomodoro", preferredSide: "right", height: 44, priority: 3 }));
    const snap = _debugFabSnapshot();
    const regsById = new Map(snap.registry.map((r) => [r.id, r] as const));
    const boxes = snap.layouts.map(([id, layout]) => {
      const r = regsById.get(id)!;
      return {
        id,
        x: [0, r.width] as [number, number],
        y: [layout.bottom, layout.bottom + r.height] as [number, number],
      };
    });
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(
          aabbOverlap(boxes[i], boxes[j]),
          `${boxes[i].id} overlaps ${boxes[j].id}`,
        ).toBe(false);
      }
    }
  });

  it("re-registering with a new height shifts dependants upward", () => {
    registerFab(reg({ id: "ai-launcher", preferredSide: "right", height: 48, priority: 2 }));
    registerFab(reg({ id: "pomodoro", preferredSide: "right", height: 44, priority: 3 }));
    const before = layoutsById()["pomodoro"].bottom;
    // Simulate AI menu opening — height grows.
    registerFab(reg({ id: "ai-launcher", preferredSide: "right", height: 48 + 8 + 196, priority: 2, expanded: true }));
    const after = layoutsById()["pomodoro"].bottom;
    expect(after).toBeGreaterThan(before);
    expect(after - before).toBe(8 + 196);
  });

  it("unregister removes a FAB and re-flows the others", () => {
    registerFab(reg({ id: "ai-launcher", preferredSide: "right", height: 48, priority: 2 }));
    registerFab(reg({ id: "pomodoro", preferredSide: "right", height: 44, priority: 3 }));
    unregisterFab("ai-launcher");
    const l = layoutsById();
    expect(l["ai-launcher"]).toBeUndefined();
    expect(l["pomodoro"]).toEqual({ side: "right", bottom: BOTTOM_NAV_OFFSET });
  });

  it("scales to many FABs without overlap (stress)", () => {
    for (let i = 0; i < 20; i++) {
      registerFab(reg({ id: `f${i}`, preferredSide: i % 2 ? "left" : "right", height: 40, priority: i }));
    }
    const snap = _debugFabSnapshot();
    const bySide: Record<string, number[]> = { left: [], right: [] };
    for (const [id, layout] of snap.layouts) {
      bySide[layout.side].push(layout.bottom);
      expect(id).toBeTruthy();
    }
    for (const side of ["left", "right"]) {
      const sorted = [...bySide[side]].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(40 + GAP);
      }
    }
  });
});
