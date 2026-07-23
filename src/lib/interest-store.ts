import { useCallback, useSyncExternalStore } from "react";
import { nanoid } from "nanoid";

// Kullanıcının ilgi/çalışma alanları (Borsa, Arsa, Sağlık…). Sabit kodlanmaz —
// kullanıcı Ayarlar'dan ekler/siler. keep-store.ts ile aynı basit
// useSyncExternalStore deseni.

export type Interest = {
  id: string;
  label: string;
  createdAt: number;
};

const STORAGE_KEY = "mintmap.interests.v1";

let items: Interest[] = [];
let initialized = false;
const listeners = new Set<() => void>();

function load() {
  if (initialized) return;
  initialized = true;
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Interest[];
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

const EMPTY: Interest[] = [];
function snapshot(): Interest[] {
  load();
  return items;
}
function serverSnapshot(): Interest[] {
  return EMPTY;
}

export function useInterests(): Interest[] {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

export const interests = {
  list(): Interest[] {
    load();
    return items;
  },
  add(label: string): Interest | null {
    load();
    const clean = label.trim();
    if (!clean) return null;
    // Aynı etiketi iki kez ekleme.
    if (items.some((i) => i.label.toLowerCase() === clean.toLowerCase())) return null;
    const full: Interest = { id: nanoid(8), label: clean, createdAt: Date.now() };
    items = [full, ...items];
    emit();
    return full;
  },
  update(id: string, label: string) {
    load();
    const clean = label.trim();
    if (!clean) return;
    items = items.map((i) => (i.id === id ? { ...i, label: clean } : i));
    emit();
  },
  remove(id: string) {
    load();
    items = items.filter((i) => i.id !== id);
    emit();
  },
};

export const useInterestActions = () => useCallback(() => interests, [])();
