import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectBackup, parseBackup, restoreBackup } from './backup';
import { NATIVE_STATE_DB, nativePersistenceTestReset } from './nativePersistence';

const actualIndexedDB = indexedDB;

function localStorageFixture(overrides: Partial<Storage> = {}): Storage {
  const values = new Map<string, string>();
  return Object.assign({
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(String(key)) ?? null,
    setItem: (key: string, value: string) => { values.set(String(key), String(value)); },
    removeItem: (key: string) => { values.delete(String(key)); },
    clear: () => { values.clear(); },
  }, overrides) as Storage;
}

function indexedDbFixture(overrides: Partial<IDBFactory>): IDBFactory {
  return Object.assign({
    open: actualIndexedDB.open.bind(actualIndexedDB),
    deleteDatabase: actualIndexedDB.deleteDatabase.bind(actualIndexedDB),
    databases: actualIndexedDB.databases?.bind(actualIndexedDB),
    cmp: actualIndexedDB.cmp.bind(actualIndexedDB),
  }, overrides) as IDBFactory;
}

async function resetNativeDatabase(): Promise<void> {
  await nativePersistenceTestReset();
  await new Promise<void>((resolve, reject) => {
    const request = actualIndexedDB.deleteDatabase(NATIVE_STATE_DB);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Could not reset native state for backup test.'));
    request.onblocked = () => reject(new Error('Native state reset was blocked in backup test.'));
  });
  await nativePersistenceTestReset();
}

async function createDatabase(name: string, storeName: string, keyPath: string | null): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = actualIndexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: keyPath ?? undefined });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(`Could not create ${name}.`));
    request.onblocked = () => reject(new Error(`Creating ${name} was blocked.`));
  });
}

async function putRecord(db: IDBDatabase, storeName: string, value: unknown, key?: IDBValidKey): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    if (key === undefined) store.put(value);
    else store.put(value, key);
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error(`Could not seed ${storeName}.`));
  });
}

async function getRecords(db: IDBDatabase, storeName: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(`Could not read ${storeName}.`));
  });
}

async function deleteDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = actualIndexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`Could not delete ${name}.`));
    request.onblocked = () => reject(new Error(`Deleting ${name} was blocked.`));
  });
}

beforeEach(async () => {
  vi.unstubAllGlobals();
  await resetNativeDatabase();
  localStorage.clear();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await resetNativeDatabase();
});

const valid = () => ({ format: 'iterra-backup' as const, v: 1, at: 1700000000000, localStorage: { personal: 'kept' }, idb: {} });
const store = () => ({ keyPath: null, autoIncrement: false, keys: ['key'], records: ['value'] });
const db = () => ({ name: 'iterra', version: 1, stores: { entities: store() } });

describe('backup validation and restore', () => {
  it('accepts existing backups with or without IndexedDB', () => {
    expect(parseBackup(JSON.stringify(valid())).localStorage.personal).toBe('kept');
    const { idb: _idb, ...legacy } = valid();
    expect(parseBackup(JSON.stringify(legacy)).idb).toEqual({});
  });
  it.each([
    { ...valid(), v: 0 }, { ...valid(), at: null }, { ...valid(), localStorage: [] },
    { ...valid(), localStorage: { key: 1 } }, { ...valid(), idb: [] },
    { ...valid(), idb: { iterra: { ...db(), version: 0 } } },
    { ...valid(), idb: { iterra: { ...db(), name: 'other' } } },
    { ...valid(), idb: { iterra: { ...db(), stores: { entities: { ...store(), records: {} } } } } },
    { ...valid(), idb: { iterra: { ...db(), stores: { entities: { ...store(), keys: [] } } } } },
    { ...valid(), idb: { iterra: { ...db(), stores: { entities: { ...store(), keys: [{}] } } } } },
    { ...valid(), idb: { iterra: { ...db(), stores: { entities: { keyPath: 'id', autoIncrement: false, keys: null, records: [{}] } } } } },
    { ...valid(), idb: { iterra: { ...db(), stores: { entities: { keyPath: 'bad path', autoIncrement: false, keys: null, records: [] } } } } },
    { ...valid(), idb: { iterra: { ...db(), stores: { entities: { keyPath: 'id', autoIncrement: true, keys: null, records: [null] } } } } },
    { ...valid(), idb: { iterra: { ...db(), stores: { entities: { keyPath: 'a.id', autoIncrement: true, keys: null, records: [{ a: 3 }] } } } } },
    { ...valid(), idb: { iterra: { ...db(), stores: { entities: { keyPath: ['id'], autoIncrement: true, keys: null, records: [] } } } } },
  ])('rejects malformed data before touching storage', async (bad) => {
    const clear = vi.fn();
    vi.stubGlobal('localStorage', localStorageFixture({ clear, setItem: vi.fn() }));
    expect(() => parseBackup(JSON.stringify(bad))).toThrow();
    await expect(restoreBackup(bad as never)).rejects.toThrow();
    expect(clear).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it('reports a storage write failure instead of claiming success', async () => {
    vi.stubGlobal('localStorage', localStorageFixture({ clear: vi.fn(), setItem: vi.fn(() => { throw new Error('quota'); }) }));
    await expect(restoreBackup(valid())).rejects.toThrow('quota');
    vi.unstubAllGlobals();
  });

  it('rolls back earlier database and localStorage changes when a later database restore fails', async () => {
    const iterra = await createDatabase('iterra', 'records', null);
    const notes = await createDatabase('ModularAINotesDB', 'notes', 'id');
    let restoredIterra: IDBDatabase | undefined;
    let restoredNotes: IDBDatabase | undefined;
    try {
      await putRecord(iterra, 'records', { value: 'before' }, 'personal');
      await putRecord(notes, 'notes', { id: 'personal', value: 'before' });
      iterra.close();
      notes.close();

      localStorage.setItem('personal', 'before');
      const { replaceNativeStores, readNativeStore, readNativeSnapshot } = await import('./nativePersistence');
      await replaceNativeStores({
        'ink-notes-storage': { state: { notes: [{ id: 'personal-ink', title: 'Before restore' }] }, version: 1 },
        'syllabus.folio.v1': { state: {
          terms: { fall: { id: 'fall', name: 'Fall' } }, courses: {}, commitments: {}, blocks: {},
          links: {}, reviews: {}, dismissed: {}, activeTermId: 'fall',
        }, version: 1 },
      });
      const nativeGenerationBefore = (await readNativeSnapshot('ink-notes-storage')).generation;

      // `iterra` is restored first and commits. The following database is
      // valid backup data but deliberately conflicts with its existing schema,
      // so the restore fails only after one database has already changed.
      const backup = {
        ...valid(),
        localStorage: { replacement: 'incoming' },
        idb: {
          iterra: { name: 'iterra', version: 1, stores: {
            records: { keyPath: null, autoIncrement: false, keys: ['incoming'], records: [{ value: 'after' }] },
          } },
          ModularAINotesDB: { name: 'ModularAINotesDB', version: 1, stores: {
            notes: { keyPath: 'differentId', autoIncrement: false, keys: null, records: [{ differentId: 'incoming', value: 'after' }] },
          } },
        },
      };

      const databasePrototype = IDBDatabase.prototype;
      const originalTransaction = databasePrototype.transaction;
      let completedIterraRestoreTransactions = 0;
      databasePrototype.transaction = function (this: IDBDatabase, ...args: any[]) {
        const transaction = originalTransaction.apply(this, args as any);
        if (this.name === 'iterra' && transaction.mode === 'readwrite') {
          transaction.addEventListener('complete', () => { completedIterraRestoreTransactions++; });
        }
        return transaction;
      } as IDBDatabase['transaction'];
      try {
        await expect(restoreBackup(backup as never)).rejects.toThrow(/incompatible schema/i);
      } finally {
        databasePrototype.transaction = originalTransaction;
      }

      // One committed write is the incoming restore; the second is rollback.
      // Reaching the later database's schema error proves the first await
      // completed, and this count makes both commits explicit regression evidence.
      expect(completedIterraRestoreTransactions).toBe(2);
      expect(localStorage.getItem('personal')).toBe('before');
      expect(localStorage.getItem('replacement')).toBeNull();
      expect(await readNativeStore('ink-notes-storage')).toEqual({ notes: [{ id: 'personal-ink', title: 'Before restore' }] });
      expect(await readNativeStore('syllabus.folio.v1')).toEqual({
        terms: { fall: { id: 'fall', name: 'Fall' } }, courses: {}, commitments: {}, blocks: {},
        links: {}, reviews: {}, dismissed: {}, activeTermId: 'fall',
      });
      expect((await readNativeSnapshot('ink-notes-storage')).generation).toBeGreaterThan(nativeGenerationBefore);
      restoredIterra = await createDatabase('iterra', 'records', null);
      restoredNotes = await createDatabase('ModularAINotesDB', 'notes', 'id');
      const iterraRecords = await getRecords(restoredIterra, 'records');
      const noteRecords = await getRecords(restoredNotes, 'notes');
      expect(iterraRecords).toEqual([{ value: 'before' }]);
      expect(noteRecords).toEqual([{ id: 'personal', value: 'before' }]);
      restoredIterra.close();
      restoredNotes.close();
    } finally {
      iterra.close();
      notes.close();
      restoredIterra?.close();
      restoredNotes?.close();
      await deleteDatabase('iterra');
      await deleteDatabase('ModularAINotesDB');
    }
  });

  it('reports an unreadable owned database instead of skipping its clear during restore', async () => {
    const notes = await createDatabase('ModularAINotesDB', 'notes', 'id');
    let restored: IDBDatabase | undefined;
    try {
      await putRecord(notes, 'notes', { id: 'personal', value: 'keep until restore is possible' });
      notes.close();
      localStorage.setItem('personal', 'before');

      const actualOpen = actualIndexedDB.open.bind(actualIndexedDB);
      let notesOpens = 0;
      vi.stubGlobal('indexedDB', indexedDbFixture({
        open: ((name: string, ...args: unknown[]) => {
          // The first open is the pre-restore backup snapshot. Deny the next
          // open, which is the restore's attempt to clear this omitted DB;
          // later opens used by rollback are allowed through.
          if (name === 'ModularAINotesDB' && ++notesOpens === 2) {
            const request: Record<string, unknown> = { error: new Error('owned DB temporarily unreadable') };
            queueMicrotask(() => (request.onerror as (() => void) | undefined)?.());
            return request as unknown as IDBOpenDBRequest;
          }
          return actualOpen(name, ...(args as [number?]));
        }) as IDBFactory['open'],
      }));

      await expect(restoreBackup(valid())).rejects.toThrow('owned DB temporarily unreadable');
      expect(localStorage.getItem('personal')).toBe('before');
      restored = await createDatabase('ModularAINotesDB', 'notes', 'id');
      expect(await getRecords(restored, 'notes')).toEqual([{ id: 'personal', value: 'keep until restore is possible' }]);
    } finally {
      notes.close();
      restored?.close();
      await deleteDatabase('ModularAINotesDB');
      vi.unstubAllGlobals();
    }
  });
});



describe('complete backup export', () => {
  it('rejects inaccessible localStorage instead of exporting an empty copy', async () => {
    const inaccessible = localStorageFixture();
    Object.defineProperty(inaccessible, 'length', { configurable: true, get() { throw new Error('denied'); } });
    vi.stubGlobal('localStorage', inaccessible);
    await expect(collectBackup()).rejects.toThrow('denied');
    vi.unstubAllGlobals();
  });
  it('rejects failed database enumeration instead of exporting a partial copy', async () => {
    vi.stubGlobal('localStorage', localStorageFixture());
    vi.stubGlobal('indexedDB', indexedDbFixture({ databases: () => Promise.reject(new Error('denied')) }));
    await expect(collectBackup()).rejects.toThrow('denied');
    vi.unstubAllGlobals();
  });
  it('rejects database open errors instead of silently omitting the database', async () => {
    vi.stubGlobal('localStorage', localStorageFixture());
    vi.stubGlobal('indexedDB', indexedDbFixture({
      databases: () => Promise.resolve([{ name: 'iterra' }]),
      open: ((name: string, ...args: unknown[]) => {
        if (name === 'iterra') throw new Error('open denied');
        return actualIndexedDB.open(name, ...(args as [number?]));
      }) as IDBFactory['open'],
    }));
    await expect(collectBackup()).rejects.toThrow('open denied');
    vi.unstubAllGlobals();
  });
  it('rejects database record read failures', async () => {
    vi.stubGlobal('localStorage', localStorageFixture());
    const failingRequest = () => {
      const request: Record<string, unknown> = { error: new Error('read denied') };
      queueMicrotask(() => (request.onerror as () => void)());
      return request;
    };
    const successfulRequest = () => {
      const request: Record<string, unknown> = { result: [] };
      queueMicrotask(() => (request.onsuccess as () => void)());
      return request;
    };
    const db = { objectStoreNames: ['records'], version: 1, close: vi.fn(),
      transaction: () => ({ objectStore: () => ({ keyPath: null, autoIncrement: false,
        getAll: failingRequest, getAllKeys: successfulRequest }) }) };
    vi.stubGlobal('indexedDB', indexedDbFixture({ databases: () => Promise.resolve([{ name: 'iterra' }]),
      open: ((name: string, ...args: unknown[]) => {
        if (name !== 'iterra') return actualIndexedDB.open(name, ...(args as [number?]));
        const request: Record<string, unknown> = { result: db };
        queueMicrotask(() => (request.onsuccess as () => void)()); return request;
      }) as IDBFactory['open'],
    }));
    await expect(collectBackup()).rejects.toThrow('read denied');
    expect(db.close).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it('rejects unavailable IndexedDB rather than claiming a complete backup', async () => {
    vi.stubGlobal('localStorage', localStorageFixture());
    const { flushAllNativeStores } = await import('./nativePersistence');
    await flushAllNativeStores();
    vi.stubGlobal('indexedDB', undefined);
    await expect(collectBackup()).rejects.toThrow('IndexedDB is unavailable');
    vi.unstubAllGlobals();
  });
});

it('drops account credentials and sync ownership from older backup files', () => {
  const backup = parseBackup(JSON.stringify({
    format: 'iterra-backup', v: 1, at: 1,
    localStorage: {
      'sb-example-auth-token': 'private session',
      'sb-example-auth-token-code-verifier': 'private verifier',
      'iterra.v1.sync.owner': 'old-owner',
      'iterra.v1.sync.enabled': '1',
      'iterra.v1.sync.out': 'old-queue',
      'iterra.v1.accent': 'rose',
    },
  }));
  expect(backup.localStorage).toEqual({ 'iterra.v1.accent': 'rose' });
});

it('preserves the destination account when exporting and restoring study data', async () => {
  localStorage.setItem('sb-workspace-auth-token', 'destination-session');
  localStorage.setItem('iterra.v1.sync.owner', 'destination-owner');
  try {
    const exported = await collectBackup();
    expect(exported.localStorage).not.toHaveProperty('sb-workspace-auth-token');
    expect(Object.keys(exported.localStorage)).not.toContain('iterra.v1.sync.owner');
    await restoreBackup({ ...exported, localStorage: {
      ...exported.localStorage, 'sb-workspace-auth-token': 'source-session',
      'iterra.v1.sync.owner': 'source-owner', 'iterra.v1.sync.enabled': '1',
    } });
    expect(localStorage.getItem('sb-workspace-auth-token')).toBe('destination-session');
    expect(localStorage.getItem('iterra.v1.sync.owner')).toBe('destination-owner');
    expect(localStorage.getItem('iterra.v1.sync.enabled')).not.toBe('1');
  } finally {
    localStorage.removeItem('sb-workspace-auth-token');
    localStorage.removeItem('iterra.v1.sync.owner');
  }
});
