/**
 * Read/clear the Web Share Target inbox written by the service worker.
 * The SW stores incoming files in IDB "mintmap-share" / store "inbox" and
 * a single default deep-link target in store "defaults" (key "current").
 */

const DB_NAME = "mintmap-share";
const STORE = "inbox";
const DEFAULTS = "defaults";
const HISTORY = "history";
const DEBUG = "debug";
const HISTORY_LIMIT = 100;
const DEBUG_LIMIT = 30;

export type SharedItem = {
  id: string;
  name: string;
  type: string;
  size: number;
  file: File | Blob;
  meta?: { title?: string; text?: string; url?: string };
  at: number;
};

export type ShareDebugEntry = {
  id: string;
  at: number;
  source: string;
  request?: Record<string, unknown>;
  form?: Record<string, unknown> | null;
  result?: Record<string, unknown>;
  client?: Record<string, unknown>;
};

function isBrowser() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 4);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(DEFAULTS)) {
        db.createObjectStore(DEFAULTS, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(HISTORY)) {
        const os = db.createObjectStore(HISTORY, { keyPath: "id" });
        os.createIndex("at", "at", { unique: false });
      }
      if (!db.objectStoreNames.contains(DEBUG)) {
        const os = db.createObjectStore(DEBUG, { keyPath: "id" });
        os.createIndex("at", "at", { unique: false });
      }
    };
    r.onsuccess = () => {
      const db = r.result;
      // Reset cache if the connection is closed externally so we can re-open.
      db.onclose = () => {
        if (dbPromise && dbPromise === currentPromise) dbPromise = null;
      };
      resolve(db);
    };
    r.onerror = () => {
      dbPromise = null;
      reject(r.error);
    };
  });
  const currentPromise = dbPromise;
  return dbPromise;
}

export async function recordShareDebug(entry: Omit<ShareDebugEntry, "id" | "at"> & { id?: string; at?: number }): Promise<void> {
  if (!isBrowser()) return;
  const full: ShareDebugEntry = {
    ...entry,
    id: entry.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    at: entry.at ?? Date.now(),
  };
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DEBUG, "readwrite");
      const store = tx.objectStore(DEBUG);
      store.put(full);
      const countReq = store.count();
      countReq.onsuccess = () => {
        const excess = (countReq.result ?? 0) - DEBUG_LIMIT;
        if (excess <= 0) return;
        const cursorReq = store.index("at").openCursor();
        let removed = 0;
        cursorReq.onsuccess = () => {
          const cur = cursorReq.result;
          if (!cur || removed >= excess) return;
          cur.delete();
          removed++;
          cur.continue();
        };
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* noop */
  }
}

export async function listShareDebug(): Promise<ShareDebugEntry[]> {
  if (!isBrowser()) return [];
  try {
    const db = await openDb();
    return await new Promise<ShareDebugEntry[]>((resolve, reject) => {
      const tx = db.transaction(DEBUG, "readonly");
      const idx = tx.objectStore(DEBUG).index("at");
      const req = idx.openCursor(null, "prev");
      const out: ShareDebugEntry[] = [];
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) {
          resolve(out);
          return;
        }
        out.push(cur.value as ShareDebugEntry);
        cur.continue();
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function clearShareDebug(): Promise<void> {
  if (!isBrowser()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DEBUG, "readwrite");
      tx.objectStore(DEBUG).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* noop */
  }
}


export type ShareDefaults = { ws: string; node: string };

export type ShareHistoryEntry = {
  id: string;
  at: number;
  ws: string;
  wsName: string;
  node: string;
  nodeTitle: string;
  count: number;
  files: Array<{ name: string; size: number; type: string }>;
  viaDeepLink: boolean;
};

export async function recordShareHistory(entry: Omit<ShareHistoryEntry, "id" | "at"> & { at?: number }): Promise<void> {
  if (!isBrowser()) return;
  const full: ShareHistoryEntry = {
    ...entry,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    at: entry.at ?? Date.now(),
  };
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HISTORY, "readwrite");
      const store = tx.objectStore(HISTORY);
      store.put(full);
      // Trim using count() + ascending cursor so we never load everything.
      const countReq = store.count();
      countReq.onsuccess = () => {
        const excess = (countReq.result ?? 0) - HISTORY_LIMIT;
        if (excess <= 0) return;
        const idx = store.index("at");
        const cursorReq = idx.openCursor(); // ascending = oldest first
        let removed = 0;
        cursorReq.onsuccess = () => {
          const cur = cursorReq.result;
          if (!cur || removed >= excess) return;
          cur.delete();
          removed++;
          cur.continue();
        };
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* noop */
  }
}

export async function listShareHistory(): Promise<ShareHistoryEntry[]> {
  if (!isBrowser()) return [];
  try {
    const db = await openDb();
    return await new Promise<ShareHistoryEntry[]>((resolve, reject) => {
      const tx = db.transaction(HISTORY, "readonly");
      // Use the "at" index in descending order — already-sorted, no JS sort.
      const idx = tx.objectStore(HISTORY).index("at");
      const req = idx.openCursor(null, "prev");
      const out: ShareHistoryEntry[] = [];
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) {
          resolve(out);
          return;
        }
        out.push(cur.value as ShareHistoryEntry);
        cur.continue();
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}


export async function clearShareHistory(): Promise<void> {
  if (!isBrowser()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HISTORY, "readwrite");
      tx.objectStore(HISTORY).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* noop */
  }
}

export async function getShareDefaults(): Promise<ShareDefaults | null> {
  if (!isBrowser()) return null;
  try {
    const db = await openDb();
    return await new Promise<ShareDefaults | null>((resolve, reject) => {
      const tx = db.transaction(DEFAULTS, "readonly");
      const req = tx.objectStore(DEFAULTS).get("current");
      req.onsuccess = () => {
        const v = req.result as { key: string; ws?: string; node?: string } | undefined;
        if (v?.ws && v?.node) resolve({ ws: v.ws, node: v.node });
        else resolve(null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function setShareDefaults(d: ShareDefaults | null): Promise<void> {
  if (!isBrowser()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DEFAULTS, "readwrite");
      const store = tx.objectStore(DEFAULTS);
      if (d) store.put({ key: "current", ws: d.ws, node: d.node });
      else store.delete("current");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* noop */
  }
}

export async function listShared(): Promise<SharedItem[]> {
  if (!isBrowser()) return [];
  try {
    const db = await openDb();
    return await new Promise<SharedItem[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as SharedItem[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function clearShared(ids: string[]): Promise<void> {
  if (!isBrowser() || !ids.length) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      ids.forEach((id) => store.delete(id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* noop */
  }
}

export function sharedToFile(item: SharedItem): File {
  if (item.file instanceof File) return item.file;
  return new File([item.file], item.name, { type: item.type });
}
