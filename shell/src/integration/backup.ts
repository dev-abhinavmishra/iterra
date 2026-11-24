/* Terrain backup — the whole local-first store in one JSON file.

   Every place keeps state in two layers: localStorage keys (zustand persist,
   hub mirrors, prefs) and IndexedDB databases (the hub's `iterra` entity store,
   margin's `ModularAINotesDB`). A backup captures BOTH, so a restore returns
   the terrain bit-for-bit — including stores this module hasn't been taught
   about, since IDB databases are enumerated live. */

const FORMAT = 'iterra-backup';
const VERSION = 1;
import { flushAllNativeStores, readNativeSnapshot, NATIVE_STATE_DB, NATIVE_STATE_KEYS, replaceNativeStores, clearNativeStoresAndFence } from './nativePersistence';

export interface BackupStore {
  keyPath: string | string[] | null;
  autoIncrement: boolean;
  /* keyPath stores carry their key inside each record; out-of-line stores
     don't, so keys are captured alongside records and restored pairwise. */
  keys: unknown[] | null;
  records: unknown[];
}

export interface BackupDb {
  name: string;
  version: number;
  stores: Record<string, BackupStore>;
}

export interface IterraBackup {
  format: typeof FORMAT;
  v: number;
  at: number;
  localStorage: Record<string, string>;
  idb: Record<string, BackupDb>;
}

export interface BackupSummary {
  at: number;
  lsKeys: number;
  dbs: number;
  records: number;
}

const KNOWN_DBS = ['iterra', 'ModularAINotesDB', NATIVE_STATE_DB];

/* exported for sibling integration tools (demo seed) that need the same
   tolerant open/list/read primitives — never throw, null on failure */
export const openDatabase = (name: string, version?: number, onUpgrade?: (db: IDBDatabase) => void): Promise<IDBDatabase | null> =>
  new Promise((res) => {
    let req: IDBOpenDBRequest;
    try {
      req = version === undefined ? indexedDB.open(name) : indexedDB.open(name, version);
    } catch {
      res(null);
      return;
    }
    req.onsuccess = () => res(req.result);
    req.onerror = () => res(null);
    req.onblocked = () => res(null);
    if (onUpgrade) req.onupgradeneeded = () => {
      try { onUpgrade(req.result); } catch { req.transaction?.abort(); }
    };
  });

export const storeAllKeys = (dbName: string, storeName: string): Promise<IDBValidKey[]> =>
  openExistingDatabase(dbName).then((db) => {
    if (!db || !db.objectStoreNames.contains(storeName)) { db?.close(); return []; }
    return new Promise<IDBValidKey[]>((res) => {
      const r = db.transaction(storeName, 'readonly').objectStore(storeName).getAllKeys();
      r.onsuccess = () => { db.close(); res(r.result || []); };
      r.onerror = () => { db.close(); res([]); };
    });
  });

export const storeAllRecords = <T = unknown>(dbName: string, storeName: string): Promise<T[]> =>
  openExistingDatabase(dbName).then((db) => {
    if (!db || !db.objectStoreNames.contains(storeName)) { db?.close(); return []; }
    return new Promise<T[]>((res) => {
      const r = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      r.onsuccess = () => { db.close(); res((r.result as T[]) || []); };
      r.onerror = () => { db.close(); res([]); };
    });
  });

/* A versionless indexedDB.open() CREATES an empty database when the name
   doesn't exist — probing "is this db there" would leave phantom empty
   databases (margin's ModularAINotesDB most visibly). onupgradeneeded
   fires exactly when the open created the db, so detect it and delete
   the phantom before returning null. */
export const openExistingDatabase = (name: string): Promise<IDBDatabase | null> =>
  new Promise((res) => {
    let created = false;
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(name);
    } catch {
      res(null);
      return;
    }
    req.onupgradeneeded = () => { created = true; };
    req.onsuccess = () => {
      const db = req.result;
      if (!created) { res(db); return; }
      db.close();
      try { indexedDB.deleteDatabase(name); } catch { /* best-effort */ }
      res(null);
    };
    req.onerror = () => res(null);
    req.onblocked = () => res(null);
  });

export const listDatabases = async (): Promise<{ name: string }[]> =>
  (await dbNames()).map((name) => ({ name }));

const dbNames = async (): Promise<string[]> => {
  try {
    /* Safari lacks indexedDB.databases() — fall back to the known names so
       the fallback path still captures every database this app creates. */
    const idb = indexedDB as unknown as { databases?: () => Promise<{ name?: string }[]> };
    if (idb.databases) {
      const list = await idb.databases();
      const names = list.map((d) => d.name).filter((n): n is string => !!n);
      return [...new Set([...KNOWN_DBS, ...names])];
    }
  } catch {
    /* enumeration unsupported — known names cover every db the terrain makes */
  }
  return KNOWN_DBS;
};

// Backup creation must distinguish a missing database from an unreadable one.
const openBackupDb = (name: string): Promise<IDBDatabase | null> => new Promise((resolve, reject) => {
  let created = false;
  let abandoned = false;
  try {
    const request = indexedDB.open(name);
    request.onupgradeneeded = () => { created = true; request.transaction?.abort(); };
    request.onsuccess = () => {
      if (abandoned) { request.result.close(); return; }
      resolve(request.result);
    };
    request.onerror = () => {
      if (created && request.error?.name === 'AbortError') resolve(null);
      else reject(request.error || new Error('Could not read database.'));
    };
    request.onblocked = () => { abandoned = true; reject(new Error('Database read was blocked.')); };
  } catch (error) { reject(error); }
});

const backupDbNames = async (): Promise<string[]> => {
  const idb = indexedDB as unknown as { databases?: () => Promise<{ name?: string }[]> };
  if (!idb.databases) return KNOWN_DBS;
  const list = await idb.databases();
  return [...new Set([...KNOWN_DBS, ...list.map(d => d.name).filter((name): name is string => !!name)])];
};

const dumpDb = async (name: string): Promise<BackupDb | null> => {
  const db = await openBackupDb(name);
  if (!db) return null;
  try {
    const stores: BackupDb['stores'] = {};
    for (const storeName of Array.from(db.objectStoreNames)) {
      const tx = db.transaction(storeName, 'readonly');
      const s = tx.objectStore(storeName);
      const completed = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error || new Error('Backup database read aborted.'));
        tx.onerror = () => reject(tx.error || new Error('Backup database read failed.'));
      });
      const keyPath = (s.keyPath ?? null) as string | string[] | null;
      const read = (r: IDBRequest): Promise<unknown[]> => new Promise((resolve, reject) => {
        r.onsuccess = () => resolve(r.result || []);
        r.onerror = () => reject(r.error || new Error('Could not read database store.'));
      });
      // Start both requests before awaiting, while the transaction is active.
      const recordsRequest = read(s.getAll());
      const keysRequest = keyPath === null ? read(s.getAllKeys()) : Promise.resolve(null);
      const [records, keys] = await Promise.all([recordsRequest, keysRequest, completed]);
      stores[storeName] = { keyPath, autoIncrement: s.autoIncrement, keys, records };
    }
    return { name, version: db.version, stores };
  } finally {
    db.close();
  }
};

export async function collectBackup(): Promise<IterraBackup> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await flushAllNativeStores();
    const before = await Promise.all(NATIVE_STATE_KEYS.map(key => readNativeSnapshot(key)));
    const backup = await captureBackupSnapshot();
    await flushAllNativeStores();
    const after = await Promise.all(NATIVE_STATE_KEYS.map(key => readNativeSnapshot(key)));
    if (before.every((snapshot, index) => snapshot.revision === after[index].revision &&
      snapshot.generation === after[index].generation && snapshot.keyGeneration === after[index].keyGeneration)) return backup;
  }
  throw new Error('Native data kept changing while the backup was created. Try again when edits are finished.');
}

// Sessions and sync ownership belong to this browser, including when importing older exports.
const browserAccountKey = (key: string) =>
  /^sb-.+-auth-token(?:$|-)/.test(key) || key.startsWith('iterra.v1.sync.');

async function captureBackupSnapshot(): Promise<IterraBackup> {
  const ls: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key == null) throw new Error('Could not read browser storage.');
    if (browserAccountKey(key)) continue;
    const value = localStorage.getItem(key);
    if (value == null) throw new Error('Browser storage changed while creating the backup.');
    ls[key] = value;
  }
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is unavailable.');
  const idb: IterraBackup['idb'] = {};
  for (const name of await backupDbNames()) {
    const db = await dumpDb(name);
    if (db && Object.keys(db.stores).length) {
      if (name === NATIVE_STATE_DB) {
        // The local receipt journal is flushed first; only committed native
        // state belongs in a portable backup. Applied IDs and old receipt
        // payloads are replay guards, not user data.
        delete db.stores.receipts;
        delete db.stores.applied;
      }
      idb[name] = db;
    }
  }
  return { format: FORMAT, v: VERSION, at: Date.now(), localStorage: ls, idb };
}

export function downloadBackup(b: IterraBackup): void {
  const blob = new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `iterra-backup-${new Date(b.at).toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function parseBackup(raw: string): IterraBackup {
  let b: unknown;
  try {
    b = JSON.parse(raw);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);
  if (!isRecord(b) || b.format !== FORMAT) throw new Error("That file isn't an Iterra backup.");
  if (typeof b.v === 'number' && b.v > VERSION) throw new Error('This backup is from a newer version of Iterra.');
  const invalid = () => { throw new Error('This backup has invalid saved data.'); };
  if (b.v !== VERSION || typeof b.at !== 'number' || !Number.isFinite(b.at) || b.at < 0 || b.at > 8640000000000000 ||
      !isRecord(b.localStorage) || Object.values(b.localStorage).some(value => typeof value !== 'string')) invalid();
  if (b.idb !== undefined && !isRecord(b.idb)) invalid();
  const validKey = (key: unknown): boolean =>
    typeof key === 'string' || (typeof key === 'number' && Number.isFinite(key)) ||
    (Array.isArray(key) && key.every(validKey));
  const inlineKey = (record: unknown, path: string): unknown => {
    if (!path) return record;
    return path.split('.').reduce<unknown>((value, part) =>
      value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, record);
  };
  for (const [name, db] of Object.entries((b.idb ?? {}) as Record<string, unknown>)) {
    if (!name || !isRecord(db) || db.name !== name || !Number.isSafeInteger(db.version) || (db.version as number) < 1 || !isRecord(db.stores)) invalid();
    for (const [storeName, store] of Object.entries((db as Record<string, unknown>).stores as Record<string, unknown>)) {
      if (!storeName || !isRecord(store)) invalid();
      const row = store as Record<string, unknown>;
      const keyPath = row.keyPath;
      if (!(keyPath === null || typeof keyPath === 'string' ||
        (Array.isArray(keyPath) && keyPath.length > 0 && keyPath.every(key => typeof key === 'string'))) ||
        typeof row.autoIncrement !== 'boolean' || !Array.isArray(row.records) ||
        (keyPath === null ? !Array.isArray(row.keys) || row.keys.length !== row.records.length : row.keys !== null)) invalid();
      const validPath = (path: string) => path === '' || path.split('.').every(part => /^[\p{ID_Start}$_][\p{ID_Continue}$\u200c\u200d]*$/u.test(part));
      if ((typeof keyPath === 'string' && !validPath(keyPath)) ||
          (Array.isArray(keyPath) && !keyPath.every(validPath)) ||
          (row.autoIncrement === true && (Array.isArray(keyPath) || keyPath === ''))) invalid();
      if (keyPath === null) {
        if (!(row.keys as unknown[]).every(validKey)) invalid();
      } else {
        for (const record of row.records as unknown[]) {
          const key = Array.isArray(keyPath) ? keyPath.map(path => inlineKey(record, path)) : inlineKey(record, keyPath as string);
          if (!validKey(key)) {
            if (key !== undefined || row.autoIncrement !== true || typeof keyPath !== 'string' || !isRecord(record)) invalid();
            let cursor: unknown = record;
            for (const part of (keyPath as string).split('.').slice(0, -1)) {
              const next = (cursor as Record<string, unknown>)[part];
              if (next === undefined) break;
              if (!isRecord(next)) invalid();
              cursor = next;
            }
          }
        }
      }
    }
  }
  const portableStorage = Object.fromEntries(Object.entries(b.localStorage as Record<string, string>)
    .filter(([key]) => !browserAccountKey(key)));
  return { ...b, localStorage: portableStorage, idb: b.idb ?? {} } as unknown as IterraBackup;
}

export function summarizeBackup(b: IterraBackup): BackupSummary {
  let records = 0;
  for (const d of Object.values(b.idb || {})) {
    for (const s of Object.values(d.stores || {})) records += s.records?.length || 0;
  }
  return {
    at: b.at,
    lsKeys: Object.keys(b.localStorage).length,
    dbs: Object.keys(b.idb || {}).length,
    records,
  };
}

const restoreDb = async (name: string, dump: BackupDb): Promise<void> => {
  let db = await openDatabase(name, dump.version, (upgrading) => {
    for (const [sn, store] of Object.entries(dump.stores)) {
      if (!upgrading.objectStoreNames.contains(sn)) upgrading.createObjectStore(sn, {
        keyPath: store.keyPath ?? undefined, autoIncrement: store.autoIncrement,
      });
    }
  });
  if (!db) db = await openDatabase(name);
  if (!db) throw new Error('Could not open backup database.');
  try {
    for (const [sn, store] of Object.entries(dump.stores)) {
      if (!db.objectStoreNames.contains(sn)) throw new Error('Backup database is missing a store.');
      const existing = db.transaction(sn, 'readonly').objectStore(sn);
      if (JSON.stringify(existing.keyPath) !== JSON.stringify(store.keyPath) || existing.autoIncrement !== store.autoIncrement)
        throw new Error('Backup database store has an incompatible schema.');
    }
    const names = Array.from(db.objectStoreNames);
    if (!names.length) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction(names, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error('Database restore aborted.'));
      tx.onerror = () => reject(tx.error || new Error('Database restore failed.'));
      try {
        for (const sn of names) {
          const os = tx.objectStore(sn);
          os.clear();
          const store = dump.stores[sn];
          if (!store) continue;
          store.records.forEach((record, i) => {
            if (store.keyPath === null) os.put(record, store.keys![i] as IDBValidKey);
            else os.put(record);
          });
        }
      } catch (error) { tx.abort(); reject(error); }
    });
  } finally { db.close(); }
};

const clearOwnedDb = async (name: string): Promise<void> => {
  // A missing database is safe to skip, but an unreadable one is not: restore
  // must not claim success while stale user data remains in a database it
  // could not clear. `openBackupDb` distinguishes those cases and rejects on
  // real open/blocked errors.
  const db = await openBackupDb(name);
  if (!db) return;
  try {
    const names = Array.from(db.objectStoreNames);
    if (!names.length) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(names, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error('Database clearing aborted.'));
      tx.onerror = () => reject(tx.error || new Error('Database clearing failed.'));
      for (const name of names) tx.objectStore(name).clear();
    });
  } finally { db.close(); }
};
/* Full reset — every localStorage key and every IndexedDB database the
   terrain owns. The caller confirms first and offers a backup; this is the
   "start over" escape hatch a local-first app owes its users. */
export async function wipeAll(): Promise<void> {
  // Fence old tabs and clear native data transactionally before broad LS
  // clearing or database deletion. If this fails, reset must fail visibly.
  await clearNativeStoresAndFence();
  localStorage.clear();
  if (typeof indexedDB === 'undefined') return;
  /* only databases this app owns — indexedDB.databases() would sweep any
     sibling project's db that shares this localhost origin in dev */
  await Promise.all(
    KNOWN_DBS.filter(name => name !== NATIVE_STATE_DB).map(
      (name) =>
        new Promise<void>((res) => {
          try {
            const req = indexedDB.deleteDatabase(name);
            req.onsuccess = () => res();
            req.onerror = () => res();
            req.onblocked = () => res();
          } catch {
            res();
          }
        }),
    ),
  );
}


export async function restoreBackup(input: IterraBackup): Promise<BackupSummary> {
  // Validate even direct callers before changing any existing data.
  const b = parseBackup(JSON.stringify(input));
  if (typeof indexedDB === 'undefined' && Object.keys(b.idb).length) throw new Error('IndexedDB is unavailable.');
  if (localStorage.getItem('iterra.v1.sync.enabled') === '1') throw new Error('Turn off shared record sync before restoring a backup.');
  const previous = await collectBackup();
  try {
    await applyBackupContents(b);
  } catch (error) {
    try { await applyBackupContents(previous); }
    catch (rollbackError) {
      throw new Error(`Restore failed and rollback also failed: ${String(rollbackError)} (original: ${String(error)})`);
    }
    throw error;
  }
  return summarizeBackup(b);
}

async function applyBackupContents(b: IterraBackup): Promise<void> {
  // Preserve the destination session and owner binding. Drop old outbound retries.
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && (!browserAccountKey(key) || key === 'iterra.v1.sync.out')) localStorage.removeItem(key);
  }
  for (const [k, v] of Object.entries(b.localStorage)) localStorage.setItem(k, v);
  if (typeof indexedDB === 'undefined') return;

  for (const name of KNOWN_DBS) {
    if (name === NATIVE_STATE_DB) continue;
    if (!b.idb[name]) await clearOwnedDb(name);
  }
  for (const [name, dump] of Object.entries(b.idb)) {
    if (name !== NATIVE_STATE_DB) await restoreDb(name, dump);
  }

  // Never restore an old native generation or receipt journal from a backup.
  // Replace only state rows and let the live helper choose a newer fence.
  const nativeDump = b.idb[NATIVE_STATE_DB];
  const stateRows = nativeDump?.stores?.states?.records ?? [];
  const nativeStates: Partial<Record<typeof NATIVE_STATE_KEYS[number], { state: Record<string, any>; version?: number } | null>> = {};
  for (const key of NATIVE_STATE_KEYS) {
    const row = stateRows.find((item: any) => item?.key === key) as any;
    if (row?.state && typeof row.state === 'object') {
      nativeStates[key] = { state: row.state, version: row.version };
      continue;
    }
    const raw = b.localStorage[key];
    if (raw) {
      const parsed = JSON.parse(raw);
      const state = parsed?.state && typeof parsed.state === 'object' ? parsed.state : parsed;
      nativeStates[key] = { state, version: Number.isInteger(parsed?.version) ? parsed.version : 0 };
    } else nativeStates[key] = null;
  }
  await replaceNativeStores(nativeStates);
}
