/* Terrain backup — the whole local-first store in one JSON file.

   Every place keeps state in two layers: localStorage keys (zustand persist,
   hub mirrors, prefs) and IndexedDB databases (the hub's `iterra` entity store,
   margin's `ModularAINotesDB`). A backup captures BOTH, so a restore returns
   the terrain bit-for-bit — including stores this module hasn't been taught
   about, since IDB databases are enumerated live. */

const FORMAT = 'iterra-backup';
const VERSION = 1;

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

const KNOWN_DBS = ['iterra', 'ModularAINotesDB'];

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
    if (onUpgrade) req.onupgradeneeded = () => onUpgrade(req.result);
  });

export const storeAllKeys = (dbName: string, storeName: string): Promise<IDBValidKey[]> =>
  openDatabase(dbName).then((db) => {
    if (!db || !db.objectStoreNames.contains(storeName)) { db?.close(); return []; }
    return new Promise<IDBValidKey[]>((res) => {
      const r = db.transaction(storeName, 'readonly').objectStore(storeName).getAllKeys();
      r.onsuccess = () => { db.close(); res(r.result || []); };
      r.onerror = () => { db.close(); res([]); };
    });
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

const dumpDb = async (name: string): Promise<BackupDb | null> => {
  const db = await openDatabase(name);
  if (!db) return null;
  try {
    const stores: BackupDb['stores'] = {};
    for (const storeName of Array.from(db.objectStoreNames)) {
      const tx = db.transaction(storeName, 'readonly');
      const s = tx.objectStore(storeName);
      const records = await new Promise<unknown[]>((res, rej) => {
        const r = s.getAll();
        r.onsuccess = () => res(r.result || []);
        r.onerror = () => rej(r.error);
      });
      const keyPath = (s.keyPath ?? null) as string | string[] | null;
      let keys: unknown[] | null = null;
      if (keyPath === null) {
        keys = await new Promise<unknown[]>((res, rej) => {
          const r = s.getAllKeys();
          r.onsuccess = () => res(r.result || []);
          r.onerror = () => rej(r.error);
        });
      }
      stores[storeName] = { keyPath, autoIncrement: s.autoIncrement, keys, records };
    }
    return { name, version: db.version, stores };
  } finally {
    db.close();
  }
};

export async function collectBackup(): Promise<IterraBackup> {
  const ls: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k == null) continue;
      const v = localStorage.getItem(k);
      if (v != null) ls[k] = v;
    }
  } catch {
    /* storage denied (private mode) — the idb half still exports */
  }

  const idb: IterraBackup['idb'] = {};
  if (typeof indexedDB !== 'undefined') {
    for (const name of await dbNames()) {
      try {
        const d = await dumpDb(name);
        if (d && Object.keys(d.stores).length) idb[name] = d;
      } catch {
        /* a store that won't read shouldn't sink the whole backup */
      }
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
  const o = b as Partial<IterraBackup>;
  if (!o || typeof o !== 'object' || o.format !== FORMAT) {
    throw new Error("That file isn't an Iterra backup.");
  }
  if (typeof o.v !== 'number' || o.v > VERSION) {
    throw new Error('This backup is from a newer version of Iterra.');
  }
  if (!o.localStorage || typeof o.localStorage !== 'object') {
    throw new Error('This backup is missing its saved data.');
  }
  return { ...o, idb: o.idb || {} } as IterraBackup;
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

const restoreDb = (name: string, dump: BackupDb): Promise<void> =>
  new Promise((res) => {
    /* Open at the backup's version so missing stores are (re)created during
       upgrade. If the live db is already newer, VersionError falls back to a
       versionless open and only stores that exist get written. */
    const finish = (db: IDBDatabase | null) => {
      if (!db) return res();
      const jobs = Object.entries(dump.stores)
        .filter(([sn]) => db.objectStoreNames.contains(sn))
        .map(
          ([sn, s]) =>
            new Promise<void>((done) => {
              const tx = db.transaction(sn, 'readwrite');
              const os = tx.objectStore(sn);
              os.clear();
              s.records.forEach((rec, i) => {
                if (s.keyPath === null) os.put(rec, s.keys?.[i] as IDBValidKey);
                else os.put(rec);
              });
              tx.oncomplete = () => done();
              tx.onerror = () => done();
              tx.onabort = () => done();
            }),
        );
      Promise.all(jobs).then(() => {
        db.close();
        res();
      });
    };
    openDatabase(name, dump.version, (upgrading) => {
      for (const [sn, s] of Object.entries(dump.stores)) {
        if (!upgrading.objectStoreNames.contains(sn)) {
          upgrading.createObjectStore(sn, {
            keyPath: s.keyPath ?? undefined,
            autoIncrement: s.autoIncrement,
          });
        }
      }
    }).then((db) => {
      if (db) return finish(db);
      openDatabase(name).then(finish);
    });
  });

/* Restore = full replace: current localStorage is cleared, backed-up stores
   are emptied and rewritten. Anything made since the backup is gone — the
   caller must have already told the user that. */
export async function restoreBackup(b: IterraBackup): Promise<BackupSummary> {
  try {
    localStorage.clear();
  } catch {
    /* storage denied — idb restore still runs */
  }
  for (const [k, v] of Object.entries(b.localStorage)) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* quota — keep restoring the rest */
    }
  }
  if (typeof indexedDB !== 'undefined') {
    for (const [name, d] of Object.entries(b.idb || {})) {
      await restoreDb(name, d);
    }
  }
  return summarizeBackup(b);
}
