import { useCallback, useSyncExternalStore } from "react";
import { nanoid } from "nanoid";

// MintMap Pulse — kullanıcının ilgi alanları/hedefleriyle ilişkili gelişmelerin
// akışı. ŞU AN DEMO/MOCK veriyle çalışır (gerçek kaynak bağlanmadı). UI'da bu
// açıkça "Demo veri" olarak gösterilir. keep-store deseni.

export type PulseItem = {
  id: string;
  title: string;
  summary: string;
  source: string;
  url?: string;
  /** Yayın tarihi (ms). */
  publishedAt: number;
  /** Sisteme alınma tarihi (ms). */
  addedAt: number;
  /** Bağlı mindmap düğümlerinin id'leri. */
  nodeIds: string[];
  /** Önem: 1 düşük, 2 orta, 3 yüksek. */
  importance: 1 | 2 | 3;
  read: boolean;
  demo?: boolean;
};

const STORAGE_KEY = "mintmap.pulse.v1";

let items: PulseItem[] = [];
let initialized = false;
const listeners = new Set<() => void>();

function load() {
  if (initialized) return;
  initialized = true;
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PulseItem[];
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

const EMPTY: PulseItem[] = [];
function snapshot(): PulseItem[] {
  load();
  return items;
}
function serverSnapshot(): PulseItem[] {
  return EMPTY;
}

export function usePulse(): PulseItem[] {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

export const pulse = {
  list(): PulseItem[] {
    load();
    return items;
  },
  markRead(id: string, read = true) {
    load();
    items = items.map((p) => (p.id === id ? { ...p, read } : p));
    emit();
  },
  dismiss(id: string) {
    load();
    items = items.filter((p) => p.id !== id);
    emit();
  },
  /** Bir gelişmeyi bir düğüme bağla/çöz. */
  toggleNode(id: string, nodeId: string) {
    load();
    items = items.map((p) => {
      if (p.id !== id) return p;
      const has = p.nodeIds.includes(nodeId);
      return {
        ...p,
        nodeIds: has ? p.nodeIds.filter((n) => n !== nodeId) : [...p.nodeIds, nodeId],
      };
    });
    emit();
  },
  /** Demo akışı — sadece kutu boşken yüklenir (kullanıcı isteğiyle). */
  seedDemo() {
    load();
    if (items.length) return;
    const now = Date.now();
    const h = 3_600_000;
    const demo: Array<Omit<PulseItem, "id" | "addedAt" | "read" | "nodeIds" | "demo">> = [
      {
        title: "Merkez bankası faiz kararı bekleniyor",
        summary: "Bu haftaki toplantı kredi ve konut piyasasını etkileyebilir.",
        source: "Örnek Finans",
        publishedAt: now - 2 * h,
        importance: 3,
      },
      {
        title: "İmar planı güncellemesi — bölge X",
        summary: "Takip ettiğin bölgede yeni imar düzenlemesi taslağı yayınlandı.",
        source: "Örnek Belediye Bülteni",
        publishedAt: now - 8 * h,
        importance: 2,
      },
      {
        title: "Konut kredisi faizlerinde hareket",
        summary: "Bankaların konut kredisi oranlarında küçük değişiklikler görüldü.",
        source: "Örnek Emlak",
        publishedAt: now - 20 * h,
        importance: 2,
      },
      {
        title: "Borsa: takip listendeki şirketin bilanço tarihi yaklaşıyor",
        summary: "Finansal sonuç açıklaması önümüzdeki hafta bekleniyor.",
        source: "Örnek Piyasa",
        publishedAt: now - 30 * h,
        importance: 1,
      },
    ];
    items = demo.map((d) => ({
      ...d,
      id: nanoid(10),
      addedAt: now,
      nodeIds: [],
      read: false,
      demo: true,
    }));
    emit();
  },
  clearAll() {
    load();
    items = [];
    emit();
  },
};

export const usePulseActions = () => useCallback(() => pulse, [])();
