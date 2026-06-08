import { openDB, type IDBPDatabase } from "idb";

// IndexedDB = de "kluis" op het apparaat. Veel grotere capaciteit dan browseropslag,
// dus foto's lopen niet vol en ingevulde voorschouwen gaan niet verloren.
const DB_NAAM = "wire-solutions";
const STORE = "kv";

let dbPromise: Promise<IDBPDatabase> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAAM, 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) {
          database.createObjectStore(STORE);
        }
      },
    });
  }
  return dbPromise;
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  return (await db()).get(STORE, key) as Promise<T | undefined>;
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  await (await db()).put(STORE, value, key);
}
