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
