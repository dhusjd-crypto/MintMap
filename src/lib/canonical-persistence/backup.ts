import { getImageDataUrl, listImageIds, putImage } from "@/lib/image-blobs";
import type { CanonicalStorage, CanonicalStoreName, PersistenceEnvelope } from "./types";
import { CANONICAL_STORES, CanonicalPersistenceError } from "./types";

export type BackupManifest = {
  backupId: string;
  createdAt: number;
  appVersion: string;
  schemaVersion: number;
  sources: string[];
  checksum: string;
  recordCounts: Record<string, number>;
};

export type CanonicalBackupBundle = {
  manifest: BackupManifest;
  legacyLocalStorage: Record<string, string>;
  canonical: Partial<Record<(typeof CANONICAL_STORES)[number], PersistenceEnvelope<unknown>[]>>;
  blobs: Record<string, string>;
};

export type BackupStore = {
  save(bundle: CanonicalBackupBundle): Promise<void>;
  get(id: string): Promise<CanonicalBackupBundle | undefined>;
  list(): Promise<CanonicalBackupBundle[]>;
  remove(id: string): Promise<void>;
};

export class InMemoryBackupStore implements BackupStore {
  private readonly values = new Map<string, CanonicalBackupBundle>();
  async save(bundle: CanonicalBackupBundle) {
    this.values.set(bundle.manifest.backupId, bundle);
  }
  async get(id: string) {
    return this.values.get(id);
  }
  async list() {
    return [...this.values.values()];
  }
  async remove(id: string) {
    this.values.delete(id);
  }
}

let backupDb: Promise<IDBDatabase> | null = null;
function openBackupDb() {
  if (backupDb) return backupDb;
  if (typeof indexedDB === "undefined")
    return Promise.reject(new Error("IndexedDB kullanılamıyor."));
  backupDb = new Promise((resolve, reject) => {
    const req = indexedDB.open("mintmap-backups", 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains("backups"))
        req.result.createObjectStore("backups", { keyPath: "manifest.backupId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      backupDb = null;
      reject(req.error);
    };
  });
  return backupDb;
}
function idbRequest<T>(req: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class IndexedDbBackupStore implements BackupStore {
  async save(bundle: CanonicalBackupBundle) {
    const db = await openBackupDb();
    const tx = db.transaction("backups", "readwrite");
    tx.objectStore("backups").put(bundle);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async get(id: string) {
    const db = await openBackupDb();
    return idbRequest(
      db.transaction("backups", "readonly").objectStore("backups").get(id),
    ) as Promise<CanonicalBackupBundle | undefined>;
  }
  async list() {
    const db = await openBackupDb();
    return idbRequest(
      db.transaction("backups", "readonly").objectStore("backups").getAll(),
    ) as Promise<CanonicalBackupBundle[]>;
  }
  async remove(id: string) {
    const db = await openBackupDb();
    const tx = db.transaction("backups", "readwrite");
    tx.objectStore("backups").delete(id);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }
}

export const backupStore = new IndexedDbBackupStore();

async function checksum(value: unknown): Promise<string> {
  const text = JSON.stringify(value);
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `fnv1a-${(hash >>> 0).toString(16)}`;
}

function legacySnapshot(): Record<string, string> {
  if (typeof localStorage === "undefined") return {};
  const keys = [
    "mindgrove.v1",
    "mindgrove.v2",
    "mintmap.keep.v1",
    "mintmap.keep.deleted.v1",
    "mintmap.goals.v1",
    "mintmap.pulse.v1",
    "mintmap.decisions.v1",
    "mintmap.watchlist.v1",
    "mintmap.interests.v1",
  ];
  return Object.fromEntries(
    keys.flatMap((key) => {
      const value = localStorage.getItem(key);
      return value === null ? [] : [[key, value]];
    }),
  );
}

export async function createBackup(
  storage: CanonicalStorage,
  store: BackupStore = backupStore,
): Promise<CanonicalBackupBundle> {
  const canonical: CanonicalBackupBundle["canonical"] = {};
  const recordCounts: Record<string, number> = {};
  for (const name of CANONICAL_STORES) {
    const records = await storage.list(name);
    if (records.length) canonical[name] = records;
    recordCounts[name] = records.length;
  }
  const blobs: Record<string, string> = {};
  for (const id of await listImageIds()) {
    const data = await getImageDataUrl(id);
    if (data) blobs[id] = data;
  }
  const base = { legacyLocalStorage: legacySnapshot(), canonical, blobs };
  const bundle: CanonicalBackupBundle = {
    ...base,
    manifest: {
      backupId: `backup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      appVersion: "mintmap",
      schemaVersion: 1,
      sources: ["legacy-localStorage", "canonical-indexedDB", "mintmap-blobs-indexedDB"],
      checksum: await checksum(base),
      recordCounts,
    },
  };
  await store.save(bundle);
  return bundle;
}

export async function validateBackup(
  bundle: CanonicalBackupBundle,
): Promise<{ valid: true; counts: Record<string, number> }> {
  if (
    !bundle?.manifest?.backupId ||
    bundle.manifest.schemaVersion !== 1 ||
    !bundle.canonical ||
    !bundle.legacyLocalStorage ||
    !bundle.blobs
  )
    throw new CanonicalPersistenceError("Yedek manifesti geçersiz.", "INVALID_RECORD");
  const actual = await checksum({
    legacyLocalStorage: bundle.legacyLocalStorage,
    canonical: bundle.canonical,
    blobs: bundle.blobs,
  });
  if (actual !== bundle.manifest.checksum)
    throw new CanonicalPersistenceError("Yedek doğrulama özeti eşleşmiyor.", "INVALID_RECORD");
  return { valid: true, counts: bundle.manifest.recordCounts };
}

export async function listBackups(store: BackupStore = backupStore) {
  return (await store.list()).sort((a, b) => b.manifest.createdAt - a.manifest.createdAt);
}

async function isValidBackup(bundle: CanonicalBackupBundle) {
  try {
    await validateBackup(bundle);
    return true;
  } catch {
    return false;
  }
}

export async function retainBackups(keepLast: number, store: BackupStore = backupStore) {
  const backups = await listBackups(store);
  const valid: CanonicalBackupBundle[] = [];
  const invalid: CanonicalBackupBundle[] = [];
  for (const backup of backups) {
    if (await isValidBackup(backup)) valid.push(backup);
    else invalid.push(backup);
  }
  const ordered = [...valid, ...invalid];
  const retained = ordered.slice(0, Math.max(1, keepLast));
  const retainedIds = new Set(retained.map((backup) => backup.manifest.backupId));
  for (const backup of ordered.filter((candidate) => !retainedIds.has(candidate.manifest.backupId)))
    await store.remove(backup.manifest.backupId);
  return retained;
}

export async function restoreBackup(
  bundle: CanonicalBackupBundle,
  storage: CanonicalStorage,
  options: { restoreLegacy?: boolean } = {},
) {
  await validateBackup(bundle);
  if (options.restoreLegacy !== false && typeof localStorage !== "undefined") {
    for (const [key, value] of Object.entries(bundle.legacyLocalStorage))
      localStorage.setItem(key, value);
  }
  for (const [store, records] of Object.entries(bundle.canonical))
    for (const record of records ?? []) await storage.put(store as CanonicalStoreName, record);
  for (const [id, data] of Object.entries(bundle.blobs)) await putImage(id, data);
}
