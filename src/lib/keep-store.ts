import { useCallback, useSyncExternalStore } from "react";
import { nanoid } from "nanoid";
import { deleteImage, getImageDataUrl, putImage } from "./image-blobs";

// A Google-Keep-style capture box. The user throws in notes, links
// (sites / movies / investment ideas) and images (screenshots); the AI
// sorts each into a short category. Fully usable without AI — cards just
// stay in "Kategorisiz" until categorized.

export type CardType = "note" | "link" | "image" | "file";

export type KeepCard = {
  id: string;
  type: CardType;
  text?: string; // note body, or caption for an image
  url?: string; // for link cards
  imageId?: string; // key into the IndexedDB blob store (image cards)
  image?: string; // LEGACY inline data URL — migrated to imageId on load
  fileId?: string; // blob-store key for file cards (PDF, doc, …)
  fileName?: string;
  fileType?: string; // MIME
  fileSize?: number;
  title?: string; // display title (link meta or AI-cleaned)
  meta?: { description?: string; image?: string; siteName?: string };
  category?: string; // AI-assigned; empty => "Kategorisiz"
  tags?: string[];
  pinned?: boolean;
  color?: string;
  createdAt: number;
  /** Last semantic change; used when cards are merged across devices. */
  updatedAt?: number;
  aiPending?: boolean; // categorization in flight
};

export const UNCATEGORIZED = "Kategorisiz";

const STORAGE_KEY = "mintmap.keep.v1";

let cards: KeepCard[] = [];
let initialized = false;
const listeners = new Set<() => void>();

function load() {
  if (initialized) return;
  initialized = true;
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as KeepCard[];
      if (Array.isArray(parsed)) cards = parsed;
    }
  } catch {
    cards = [];
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  } catch {
    /* quota — ignore for now */
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

const EMPTY: KeepCard[] = [];
function snapshot(): KeepCard[] {
  load();
  return cards;
}
function serverSnapshot(): KeepCard[] {
  return EMPTY;
}

export function useCards(): KeepCard[] {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

export const keep = {
  list(): KeepCard[] {
    load();
    return cards;
  },
  get(id: string): KeepCard | undefined {
    load();
    return cards.find((c) => c.id === id);
  },
  add(card: Omit<KeepCard, "id" | "createdAt"> & { id?: string; createdAt?: number }): KeepCard {
    load();
    const full: KeepCard = {
      ...card,
      id: card.id ?? nanoid(10),
      createdAt: card.createdAt ?? Date.now(),
      updatedAt: card.updatedAt ?? Date.now(),
    };
    cards = [full, ...cards];
    emit();
    return full;
  },
  update(id: string, patch: Partial<KeepCard>) {
    load();
    cards = cards.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c));
    emit();
  },
  remove(id: string) {
    load();
    const card = cards.find((c) => c.id === id);
    cards = cards.filter((c) => c.id !== id);
    emit();
    if (card?.imageId) void deleteImage(card.imageId);
    if (card?.fileId) void deleteImage(card.fileId);
  },
  togglePin(id: string) {
    load();
    cards = cards.map((c) => (c.id === id ? { ...c, pinned: !c.pinned, updatedAt: Date.now() } : c));
    emit();
  },
  /** Distinct categories present, most-used first, excluding empty. */
  categories(): string[] {
    load();
    const counts = new Map<string, number>();
    cards.forEach((c) => {
      const cat = c.category?.trim();
      if (cat) counts.set(cat, (counts.get(cat) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  },
  async getPortableSnapshot(): Promise<KeepCard[]> {
    load();
    return Promise.all(
      cards.map(async (card) => ({
        ...card,
        image: card.imageId ? (await getImageDataUrl(card.imageId)) ?? card.image : card.image,
        imageId: undefined,
      })),
    );
  },
  async importPortableSnapshot(next: KeepCard[]) {
    const restored = await Promise.all(
      next.map(async (card) => {
        if (card.type !== "image" || !card.image?.startsWith("data:")) return card;
        const imageId = nanoid(12);
        return (await putImage(imageId, card.image)) ? { ...card, imageId, image: undefined } : card;
      }),
    );
    cards = restored;
    emit();
  },
  /** Applies a metadata-only cloud snapshot. Local IndexedDB files stay put. */
  importCloudSnapshot(next: KeepCard[]) {
    cards = next;
    emit();
  },
  /** Subscribe without React; used by the background cloud reconciler. */
  subscribeAll(listener: () => void): () => void {
    return subscribe(listener);
  },
};

export const useKeepActions = () => useCallback(() => keep, [])();
