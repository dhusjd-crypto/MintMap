/**
 * Floating Action Button (FAB) slot system.
 *
 * Every FAB in the app registers itself with this store. The layout
 * algorithm computes a non-overlapping (side, bottomOffset) for each
 * registered FAB, so independent components never collide regardless
 * of which combination is mounted at a given moment.
 *
 * Coordinate system:
 *   - `bottom` is CSS pixels from the bottom of the viewport
 *     (above the BottomNav, see `BOTTOM_NAV_OFFSET`).
 *   - `side` is the horizontal anchor: 'left' or 'right'.
 *   - Heights are the full visual height of the FAB cluster the
 *     component occupies when expanded (so the wrench toolbar reports
 *     its open height, AI/Pomodoro report their button height).
 */

import { useEffect, useMemo, useSyncExternalStore } from "react";

export type FabSide = "left" | "right";

export type FabRegistration = {
  id: string;
  /** Preferred side; overlap-avoidance may flip to the other side. */
  preferredSide: FabSide;
  /** Visual height in CSS px (used for stacking and overlap checks). */
  height: number;
  /** Width in CSS px (rough; used only for overlap heuristic). */
  width: number;
  /**
   * Stacking priority: lower values anchor closer to the bottom.
   * Conflict-tiebreaker when two FABs claim the same slot.
   *
   *   0 — mindmap context (Plus, Görev, Sil)
   *   1 — wrench toolbar
   *   2 — AI launcher
   *   3 — Pomodoro
   */
  priority: number;
  /**
   * When true, the FAB temporarily reserves more vertical space (its
   * own height) than its collapsed footprint. Used by the wrench
   * toolbar's expanded column.
   */
  expanded?: boolean;
};

export type FabLayout = {
  side: FabSide;
  bottom: number;
};

/** Distance from the viewport bottom edge to the highest BottomNav pixel. */
export const BOTTOM_NAV_OFFSET = 72;

/** Gap between stacked FABs on the same side. */
const GAP = 12;

type Store = {
  registry: Map<string, FabRegistration>;
};

// `registry` is replaced with a NEW Map on every mutation so that
// `useSyncExternalStore` sees a fresh snapshot reference and re-runs
// consumers. Mutating in place would keep the same reference and
// React would skip the re-render.
const store: Store = { registry: new Map() };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function registerFab(reg: FabRegistration) {
  const next = new Map(store.registry);
  next.set(reg.id, reg);
  store.registry = next;
  emit();
}

export function unregisterFab(id: string) {
  if (!store.registry.has(id)) return;
  const next = new Map(store.registry);
  next.delete(id);
  store.registry = next;
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return store.registry;
}


/**
 * Compute the layout for every registered FAB. Pure function of the
 * current registry — re-runs whenever a FAB registers/unregisters/updates.
 *
 * Algorithm:
 *   1. Group FABs by their final side.
 *   2. Within a side, sort by priority ascending and stack them from
 *      the bottom up, separated by `GAP`.
 *   3. A FAB whose `preferredSide` collides (same priority slot
 *      already taken) flips to the other side.
 */
function computeLayouts(registry: Map<string, FabRegistration>): Map<string, FabLayout> {
  const byId = new Map<string, FabLayout>();
  const sides: Record<FabSide, FabRegistration[]> = { left: [], right: [] };

  // First pass: respect preferredSide.
  const sorted = [...registry.values()].sort((a, b) => a.priority - b.priority);
  for (const reg of sorted) sides[reg.preferredSide].push(reg);

  // Stack each side from the bottom up.
  for (const side of ["left", "right"] as FabSide[]) {
    let cursor = BOTTOM_NAV_OFFSET;
    for (const reg of sides[side]) {
      byId.set(reg.id, { side, bottom: cursor });
      cursor += reg.height + GAP;
    }
  }

  return byId;
}

/**
 * Hook used by every floating action button. Registers the FAB on
 * mount, updates its registration when inputs change, and returns
 * the current `{ side, bottom }` layout — or `null` while the very
 * first render is in flight.
 */
export function useFabSlot(reg: FabRegistration): FabLayout {
  // Re-register whenever any field changes.
  const key = `${reg.id}|${reg.preferredSide}|${reg.height}|${reg.width}|${reg.priority}|${reg.expanded ? 1 : 0}`;
  useEffect(() => {
    registerFab(reg);
    return () => unregisterFab(reg.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const registry = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const layouts = useMemo(() => computeLayouts(registry), [registry]);
  return (
    layouts.get(reg.id) ?? { side: reg.preferredSide, bottom: BOTTOM_NAV_OFFSET }
  );
}

/** Test/debug helper: snapshot of all registered FABs. */
export function _debugFabSnapshot() {
  return {
    registry: [...store.registry.values()],
    layouts: [...computeLayouts(store.registry).entries()],
  };
}
