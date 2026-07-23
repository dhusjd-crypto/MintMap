import { useCallback, useSyncExternalStore } from "react";
import { nanoid } from "nanoid";
import type { MindNode } from "./mindmap-store";

// Hedefler ayrı bir varlıktır (kullanıcı kararı: node türü değil, ayrı store).
// Bir hedef bir veya birden çok mindmap düğümüne bağlanabilir; ilerlemesi bağlı
// düğümlerin görevlerinden HESAPLANIR (statik yüzde tutulmaz). keep-store deseni.

export type GoalStatus = "active" | "paused" | "done";

export type Goal = {
  id: string;
  title: string;
  why?: string;
  description?: string;
  startAt?: number;
  dueAt?: number;
  status: GoalStatus;
  priority?: 1 | 2 | 3 | 4;
  /** Bu hedefe bağlı mindmap düğümlerinin id'leri. */
  nodeIds: string[];
  createdAt: number;
  updatedAt: number;
};

const STORAGE_KEY = "mintmap.goals.v1";

let items: Goal[] = [];
let initialized = false;
const listeners = new Set<() => void>();

function load() {
  if (initialized) return;
  initialized = true;
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Goal[];
      if (Array.isArray(parsed)) items = parsed;
    }
  } catch {
    items = [];
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* kota — şimdilik yoksay */
  }
}

function emit() {
  persist();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  load();
  listeners.add(l);
  return () => listeners.delete(l);
}

const EMPTY: Goal[] = [];
function snapshot(): Goal[] {
  load();
  return items;
}
function serverSnapshot(): Goal[] {
  return EMPTY;
}

export function useGoals(): Goal[] {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

export const goals = {
  list(): Goal[] {
    load();
    return items;
  },
  get(id: string): Goal | undefined {
    load();
    return items.find((g) => g.id === id);
  },
  add(input: {
    title: string;
    why?: string;
    dueAt?: number;
    nodeIds?: string[];
    priority?: Goal["priority"];
  }): Goal | null {
    load();
    const title = input.title.trim();
    if (!title) return null;
    const now = Date.now();
    const full: Goal = {
      id: nanoid(8),
      title,
      why: input.why?.trim() || undefined,
      dueAt: input.dueAt,
      priority: input.priority,
      status: "active",
      nodeIds: input.nodeIds ?? [],
      createdAt: now,
      updatedAt: now,
    };
    items = [full, ...items];
    emit();
    return full;
  },
  update(id: string, patch: Partial<Omit<Goal, "id" | "createdAt">>) {
    load();
    items = items.map((g) => (g.id === id ? { ...g, ...patch, updatedAt: Date.now() } : g));
    emit();
  },
  remove(id: string) {
    load();
    items = items.filter((g) => g.id !== id);
    emit();
  },
  /** Bir düğümü hedefe bağla/çöz. */
  toggleNode(goalId: string, nodeId: string) {
    load();
    items = items.map((g) => {
      if (g.id !== goalId) return g;
      const has = g.nodeIds.includes(nodeId);
      return {
        ...g,
        nodeIds: has ? g.nodeIds.filter((n) => n !== nodeId) : [...g.nodeIds, nodeId],
        updatedAt: Date.now(),
      };
    });
    emit();
  },
};

/**
 * Hedefin ilerlemesi: bağlı düğümlerin görevlerinden hesaplanır.
 * Dönüş: { done, total, percent }. Görev yoksa percent 0.
 */
export function goalProgress(
  goal: Goal,
  nodes: MindNode[],
): { done: number; total: number; percent: number } {
  const linked = new Set(goal.nodeIds);
  let done = 0;
  let total = 0;
  for (const n of nodes) {
    if (!linked.has(n.id)) continue;
    for (const t of n.todos) {
      total += 1;
      if (t.done) done += 1;
    }
  }
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return { done, total, percent };
}

export const useGoalActions = () => useCallback(() => goals, [])();
