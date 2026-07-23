import { useCallback, useSyncExternalStore } from "react";
import { nanoid } from "nanoid";

// Borsa izleme listesi — takip edilen şirketler ve yatırım tezleri. Bir takip
// aracıdır: gerçek alım-satım / aracı kurum bağlantısı YOK, al-sat tavsiyesi YOK.
// keep-store deseni.

export type WatchStatus = "watching" | "researching" | "holding" | "exited";

export const WATCH_STATUS: Record<WatchStatus, string> = {
  watching: "İzleniyor",
  researching: "Araştırma",
  holding: "Portföyde",
  exited: "Çıkıldı",
};

export type WatchItem = {
  id: string;
  /** Sembol/kod (örn. ASELS). */
  symbol: string;
  name?: string;
  sector?: string;
  /** Yatırım tezi. */
  thesis?: string;
  /** Riskler. */
  risks?: string;
  /** Beklenen katalizörler. */
  catalysts?: string;
  /** Finansal sonuç (bilanço) tarihi — ms. */
  earningsAt?: number;
  notes?: string;
  status: WatchStatus;
  createdAt: number;
  updatedAt: number;
};

const STORAGE_KEY = "mintmap.watchlist.v1";

let items: WatchItem[] = [];
let initialized = false;
const listeners = new Set<() => void>();

function load() {
  if (initialized) return;
  initialized = true;
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WatchItem[];
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

const EMPTY: WatchItem[] = [];
function snapshot(): WatchItem[] {
  load();
  return items;
}
function serverSnapshot(): WatchItem[] {
  return EMPTY;
}

export function useWatchlist(): WatchItem[] {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

export const watchlist = {
  list(): WatchItem[] {
    load();
    return items;
  },
  add(input: { symbol: string; name?: string }): WatchItem | null {
    load();
    const symbol = input.symbol.trim().toUpperCase();
    if (!symbol) return null;
    const now = Date.now();
    const full: WatchItem = {
      id: nanoid(8),
      symbol,
      name: input.name?.trim() || undefined,
      status: "watching",
      createdAt: now,
      updatedAt: now,
    };
    items = [full, ...items];
    emit();
    return full;
  },
  update(id: string, patch: Partial<Omit<WatchItem, "id" | "createdAt">>) {
    load();
    items = items.map((w) => (w.id === id ? { ...w, ...patch, updatedAt: Date.now() } : w));
    emit();
  },
  remove(id: string) {
    load();
    items = items.filter((w) => w.id !== id);
    emit();
  },
};

export const useWatchlistActions = () => useCallback(() => watchlist, [])();
