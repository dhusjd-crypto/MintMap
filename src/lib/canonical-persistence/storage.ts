import {
  CANONICAL_DB_NAME,
  CANONICAL_DB_VERSION,
  CANONICAL_STORES,
  CanonicalPersistenceError,
  type CanonicalStorage,
  type CanonicalStoreName,
  type PersistenceEnvelope,
} from "./types";

function browserAvailable() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openCanonicalDatabase(): Promise<IDBDatabase> {
  if (!browserAvailable()) {
    return Promise.reject(
      new CanonicalPersistenceError("IndexedDB kullanılamıyor.", "UNAVAILABLE"),
    );
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const opening = indexedDB.open(CANONICAL_DB_NAME, CANONICAL_DB_VERSION);
    opening.onupgradeneeded = () => {
      const db = opening.result;
      for (const name of CANONICAL_STORES) {
        if (db.objectStoreNames.contains(name)) continue;
        const store = db.createObjectStore(name, { keyPath: "id" });
        if (name === "finance_accounts")
          store.createIndex("financeBookId", "payload.financeBookId", { unique: false });
        if (name === "finance_transactions") {
          store.createIndex("financeBookId", "payload.financeBookId", { unique: false });
          store.createIndex("accountId", "payload.accountId", { unique: false });
          store.createIndex("date", "payload.date", { unique: false });
          store.createIndex("status", "payload.status", { unique: false });
        }
        if (name === "finance_obligations") {
          store.createIndex("financeBookId", "payload.financeBookId", { unique: false });
          store.createIndex("dueDate", "payload.dueDate", { unique: false });
          store.createIndex("status", "payload.status", { unique: false });
        }
        if (name === "finance_payments")
          store.createIndex("obligationId", "payload.obligationId", { unique: false });
        if (name === "finance_statements") {
          store.createIndex("financeBookId", "payload.financeBookId", { unique: false });
          store.createIndex("cardAccountId", "payload.cardAccountId", { unique: false });
        }
        if (name === "execution_extensions") {
          store.createIndex("state", "payload.state", { unique: false });
          store.createIndex("dueAt", "payload.dueAt", { unique: false });
          store.createIndex("followUpAt", "payload.followUpAt", { unique: false });
        }
      }
    };
    opening.onsuccess = () => {
      opening.result.onversionchange = () => opening.result.close();
      resolve(opening.result);
    };
    opening.onerror = () => {
      dbPromise = null;
      reject(
        new CanonicalPersistenceError("Canonical IndexedDB açılamadı.", "UNAVAILABLE", {
          cause: opening.error ?? undefined,
        }),
      );
    };
  });
  return dbPromise;
}

export class IndexedDbCanonicalStorage implements CanonicalStorage {
  async get<T>(store: CanonicalStoreName, id: string) {
    const db = await openCanonicalDatabase();
    const tx = db.transaction(store, "readonly");
    return (await request(tx.objectStore(store).get(id))) as PersistenceEnvelope<T> | undefined;
  }
  async list<T>(store: CanonicalStoreName) {
    const db = await openCanonicalDatabase();
    const tx = db.transaction(store, "readonly");
    return (await request(tx.objectStore(store).getAll())) as PersistenceEnvelope<T>[];
  }
  async put<T>(store: CanonicalStoreName, value: PersistenceEnvelope<T>) {
    const db = await openCanonicalDatabase();
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(
          new CanonicalPersistenceError("Canonical kayıt yazılamadı.", "WRITE_FAILED", {
            cause: tx.error ?? undefined,
          }),
        );
    });
  }
  async remove(store: CanonicalStoreName, id: string) {
    const db = await openCanonicalDatabase();
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(
          new CanonicalPersistenceError("Canonical kayıt silinemedi.", "WRITE_FAILED", {
            cause: tx.error ?? undefined,
          }),
        );
    });
  }
}

export class InMemoryCanonicalStorage implements CanonicalStorage {
  private readonly stores = new Map<
    CanonicalStoreName,
    Map<string, PersistenceEnvelope<unknown>>
  >();
  constructor() {
    for (const name of CANONICAL_STORES) this.stores.set(name, new Map());
  }
  async get<T>(store: CanonicalStoreName, id: string) {
    return this.stores.get(store)?.get(id) as PersistenceEnvelope<T> | undefined;
  }
  async list<T>(store: CanonicalStoreName) {
    return [...(this.stores.get(store)?.values() ?? [])] as PersistenceEnvelope<T>[];
  }
  async put<T>(store: CanonicalStoreName, value: PersistenceEnvelope<T>) {
    this.stores.get(store)?.set(value.id, value as PersistenceEnvelope<unknown>);
  }
  async remove(store: CanonicalStoreName, id: string) {
    this.stores.get(store)?.delete(id);
  }
}

export const canonicalStorage = new IndexedDbCanonicalStorage();
