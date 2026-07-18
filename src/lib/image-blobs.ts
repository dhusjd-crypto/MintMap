// Image blob storage in IndexedDB.
//
// localStorage caps out around ~5MB and base64 inflates images ~33%, so a
// handful of screenshots used to silently blow the quota (the write just
// throws and the card is lost). Blobs live here instead; cards only keep a
// short `imageId`. Object URLs are cached per id so re-renders don't churn.

const DB_NAME = "mintmap-blobs";
const STORE = "images";

let dbPromise: Promise<IDBDatabase> | null = null;
const urlCache = new Map<string, string>();

function isBrowser() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => {
      dbPromise = null;
      reject(r.error);
    };
  });
  return dbPromise;
}

export function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const [head, b64] = dataUrl.split(",");
    if (!b64) return null;
    const mime = head.match(/data:([^;]+)/)?.[1] || "image/jpeg";
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  } catch {
    return null;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Store an image (data URL or Blob). Returns true on success. */
export async function putImage(id: string, image: string | Blob): Promise<boolean> {
  if (!isBrowser()) return false;
  const blob = typeof image === "string" ? dataUrlToBlob(image) : image;
  if (!blob) return false;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}

export async function getImage(id: string): Promise<Blob | null> {
  if (!isBrowser()) return null;
  try {
    const db = await openDb();
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve((req.result as Blob) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/** Cached object URL for <img src>. */
export async function getImageUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const blob = await getImage(id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

/** Data URL — needed when sending the image to the AI or the share sheet. */
export async function getImageDataUrl(id: string): Promise<string | null> {
  const blob = await getImage(id);
  if (!blob) return null;
  try {
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
}

export async function deleteImage(id: string): Promise<void> {
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
  if (!isBrowser()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* ignore */
  }
}

/** Rough total bytes held, for a storage indicator. */
export async function totalBytes(): Promise<number> {
  if (!isBrowser()) return 0;
  try {
    const db = await openDb();
    return await new Promise<number>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () =>
        resolve(((req.result as Blob[]) ?? []).reduce((sum, b) => sum + (b?.size ?? 0), 0));
      req.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}
