/**
 * Persistent image upload queue backed by IndexedDB.
 *
 * Stores raw File blobs together with the target node id so an in-flight
 * compression batch can be resumed after a page reload / tab close.
 */

const DB_NAME = "mindgrove-uploads";
const STORE = "queue";
const VERSION = 1;

export type QueueItem = {
  id: string;
  nodeId: string;
  name: string;
  type: string;
  size: number;
  createdAt: number;
  file: File | Blob;
};

function isBrowser() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "id" });
        os.createIndex("nodeId", "nodeId", { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}


async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | void> {
  if (!isBrowser()) return;
  const db = await openDb();
  return new Promise<T | void>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result: T | undefined;
    const req = fn(store);
    if (req) req.onsuccess = () => (result = req.result);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function enqueueFiles(nodeId: string, files: File[]): Promise<QueueItem[]> {
  if (!isBrowser() || !files.length) return [];
  const items: QueueItem[] = files.map((f) => ({
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    nodeId,
    name: f.name,
    type: f.type,
    size: f.size,
    createdAt: Date.now(),
    file: f,
  }));
  try {
    await tx("readwrite", (s) => {
      items.forEach((it) => s.put(it));
      return undefined as unknown as IDBRequest;
    });
  } catch {
    // Quota or serialization failure — proceed without persistence.
  }
  return items;
}

export async function removeFromQueue(ids: string[]): Promise<void> {
  if (!isBrowser() || !ids.length) return;
  try {
    await tx("readwrite", (s) => {
      ids.forEach((id) => s.delete(id));
      return undefined as unknown as IDBRequest;
    });
  } catch {
    /* noop */
  }
}

export async function listQueueForNode(nodeId: string): Promise<QueueItem[]> {
  if (!isBrowser()) return [];
  try {
    const db = await openDb();
    return await new Promise<QueueItem[]>((resolve, reject) => {
      const t = db.transaction(STORE, "readonly");
      const idx = t.objectStore(STORE).index("nodeId");
      const req = idx.getAll(nodeId);
      req.onsuccess = () => resolve((req.result as QueueItem[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function listAllQueue(): Promise<QueueItem[]> {
  if (!isBrowser()) return [];
  try {
    const db = await openDb();
    return await new Promise<QueueItem[]>((resolve, reject) => {
      const t = db.transaction(STORE, "readonly");
      const req = t.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as QueueItem[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

/** Convert a stored queue item back into a File for the compressor. */
export function itemToFile(item: QueueItem): File {
  if (item.file instanceof File) return item.file;
  return new File([item.file], item.name, { type: item.type });
}
