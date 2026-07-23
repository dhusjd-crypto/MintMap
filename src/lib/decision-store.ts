import { useCallback, useSyncExternalStore } from "react";
import { nanoid } from "nanoid";

// Karar kayıt sistemi — kullanıcının neden belirli bir karar verdiğini sonradan
// hatırlayabilmesi için. Karar bir düğüme bağlanabilir. keep-store deseni.

export type Decision = {
  id: string;
  title: string;
  nodeId?: string;
  /** Borsa izleme listesi kaydına bağlıysa. */
  watchId?: string;
  /** Neden bu karar verildi. */
  rationale?: string;
  /** Sonradan doldurulan gerçekleşen sonuç. */
  outcome?: string;
  decidedAt: number;
  createdAt: number;
  updatedAt: number;
};

const STORAGE_KEY = "mintmap.decisions.v1";

let items: Decision[] = [];
let initialized = false;
const listeners = new Set<() => void>();

function load() {
  if (initialized) return;
  initialized = true;
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Decision[];
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

const EMPTY: Decision[] = [];
function snapshot(): Decision[] {
  load();
  return items;
}
function serverSnapshot(): Decision[] {
  return EMPTY;
}

export function useDecisions(): Decision[] {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

export const decisions = {
  list(): Decision[] {
    load();
    return items;
  },
  forNode(nodeId: string): Decision[] {
    load();
    return items.filter((d) => d.nodeId === nodeId);
  },
  forWatch(watchId: string): Decision[] {
    load();
    return items.filter((d) => d.watchId === watchId);
  },
  add(input: {
    title: string;
    nodeId?: string;
    watchId?: string;
    rationale?: string;
  }): Decision | null {
    load();
    const title = input.title.trim();
    if (!title) return null;
    const now = Date.now();
    const full: Decision = {
      id: nanoid(8),
      title,
      nodeId: input.nodeId,
      watchId: input.watchId,
      rationale: input.rationale?.trim() || undefined,
      decidedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    items = [full, ...items];
    emit();
    return full;
  },
  update(id: string, patch: Partial<Omit<Decision, "id" | "createdAt">>) {
    load();
    items = items.map((d) => (d.id === id ? { ...d, ...patch, updatedAt: Date.now() } : d));
    emit();
  },
  remove(id: string) {
    load();
    items = items.filter((d) => d.id !== id);
    emit();
  },
};

export const useDecisionActions = () => useCallback(() => decisions, [])();
