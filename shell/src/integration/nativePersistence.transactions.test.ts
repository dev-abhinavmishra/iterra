import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NATIVE_PENDING_PREFIX,
  NATIVE_STATE_DB,
  NATIVE_STATE_DB_VERSION,
  type NativeStateKey,
} from './nativePersistence';

type NativeModule = typeof import('./nativePersistence');
const INK: NativeStateKey = 'ink-notes-storage';
const FOLIO: NativeStateKey = 'syllabus.folio.v1';
const modules: NativeModule[] = [];
const pendingUnhandled: unknown[] = [];
const pendingUncaught: unknown[] = [];
const nativeErrors: Array<{ key?: string; phase?: string; message?: string }> = [];
let onUnhandled: ((reason: unknown) => void) | undefined;
let onUncaught: ((error: Error, origin: NodeJS.UncaughtExceptionOrigin) => void) | undefined;
let originalWindow: unknown;
let hadWindow = false;
let originalCustomEvent: unknown;
let hadCustomEvent = false;
let originalSessionStorage: unknown;
let hadSessionStorage = false;
let expectNativeErrors: string[] = [];

class TestCustomEvent<T = unknown> extends Event {
  readonly detail: T;
  constructor(type: string, init?: CustomEventInit<T>) {
    super(type, init);
    this.detail = init?.detail as T;
  }
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(String(key)) ?? null,
    setItem: (key, value) => { values.set(String(key), String(value)); },
    removeItem: key => { values.delete(String(key)); },
    clear: () => { values.clear(); },
  } as Storage;
}

async function loadNative(): Promise<NativeModule> {
  const native = await import('./nativePersistence');
  modules.push(native);
  return native;
}

function pendingKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(NATIVE_PENDING_PREFIX)) keys.push(key);
  }
  return keys;
}

function wrapper(state: Record<string, unknown>, version = 0): string {
  return JSON.stringify({ state, version });
}

function resetRequest(request: IDBOpenDBRequest): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('states')) db.createObjectStore('states', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('receipts')) db.createObjectStore('receipts', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('applied')) db.createObjectStore('applied', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open test IndexedDB.'));
    request.onblocked = () => reject(new Error('Test IndexedDB delete was blocked by an open helper connection.'));
  });
}

async function closeAndDeleteDatabase(): Promise<void> {
  for (const native of modules) await native.nativePersistenceTestReset();
  const request = indexedDB.deleteDatabase(NATIVE_STATE_DB);
  await new Promise<void>((resolve, reject) => {
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Could not delete test IndexedDB.'));
    request.onblocked = () => reject(new Error('Test IndexedDB deletion remained blocked.'));
  });
  for (const native of modules) await native.nativePersistenceTestReset();
  modules.length = 0;
}

async function readRawState(key: NativeStateKey): Promise<any> {
  const db = await resetRequest(indexedDB.open(NATIVE_STATE_DB, NATIVE_STATE_DB_VERSION));
  try {
    const tx = db.transaction('states', 'readonly');
    const request = tx.objectStore('states').get(key);
    const row = await new Promise<any>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Could not inspect test state row.'));
      tx.onabort = () => reject(tx.error ?? new Error('State inspection transaction aborted.'));
    });
    return row;
  } finally {
    db.close();
  }
}

async function readRawApplied(id: string): Promise<any> {
  const db = await resetRequest(indexedDB.open(NATIVE_STATE_DB, NATIVE_STATE_DB_VERSION));
  try {
    const tx = db.transaction('applied', 'readonly');
    const request = tx.objectStore('applied').get(id);
    return await new Promise<any>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Could not inspect applied receipt.'));
      tx.onabort = () => reject(tx.error ?? new Error('Applied receipt inspection aborted.'));
    });
  } finally {
    db.close();
  }
}

async function expectNativeState(native: NativeModule, key: NativeStateKey) {
  return native.readNativeStore(key);
}

describe('native persistence transaction lifecycles', () => {
  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    pendingUnhandled.length = 0;
    pendingUncaught.length = 0;
    nativeErrors.length = 0;
    expectNativeErrors = [];

    hadWindow = Object.prototype.hasOwnProperty.call(globalThis, 'window');
    originalWindow = (globalThis as any).window;
    hadCustomEvent = Object.prototype.hasOwnProperty.call(globalThis, 'CustomEvent');
    originalCustomEvent = (globalThis as any).CustomEvent;
    hadSessionStorage = Object.prototype.hasOwnProperty.call(globalThis, 'sessionStorage');
    originalSessionStorage = (globalThis as any).sessionStorage;
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: createMemoryStorage() });
    if (!hadCustomEvent) Object.defineProperty(globalThis, 'CustomEvent', { configurable: true, value: TestCustomEvent });
    const eventTarget = new EventTarget();
    eventTarget.addEventListener('iterra:native-persistence-error', event => {
      nativeErrors.push((event as CustomEvent).detail);
    });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: eventTarget });

    onUnhandled = reason => pendingUnhandled.push(reason);
    onUncaught = error => pendingUncaught.push(error);
    process.on('unhandledRejection', onUnhandled);
    process.on('uncaughtExceptionMonitor', onUncaught);
    await closeAndDeleteDatabase();
  });

  afterEach(async () => {
    await closeAndDeleteDatabase();
    if (onUnhandled) process.off('unhandledRejection', onUnhandled);
    if (onUncaught) process.off('uncaughtExceptionMonitor', onUncaught);
    expect(pendingUnhandled, 'unexpected unhandled promise rejection').toEqual([]);
    expect(pendingUncaught, 'unexpected uncaught exception').toEqual([]);
    expect(nativeErrors.map(event => event.phase), 'native persistence events must be asserted by the test').toEqual(expectNativeErrors);
    if (hadWindow) Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    else delete (globalThis as any).window;
    if (hadCustomEvent) Object.defineProperty(globalThis, 'CustomEvent', { configurable: true, value: originalCustomEvent });
    else delete (globalThis as any).CustomEvent;
    if (hadSessionStorage) Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: originalSessionStorage });
    else delete (globalThis as any).sessionStorage;
  });

  it('merges two isolated module actors that both write from a stale baseline', async () => {
    const firstModule = await loadNative();
    await firstModule.replaceNativeStores({ [INK]: { state: { notes: [], folders: [], drafts: {} }, version: 3 } });

    vi.resetModules();
    const secondModule = await loadNative();
    const firstActor = firstModule.createNativeStateStorage(INK);
    const secondActor = secondModule.createNativeStateStorage(INK);
    const firstBaseline = JSON.parse((await firstActor.getItem(INK))!);
    const secondBaseline = JSON.parse((await secondActor.getItem(INK))!);
    expect(firstBaseline.state.notes).toEqual([]);
    expect(secondBaseline.state.notes).toEqual([]);

    const firstState = {
      ...firstBaseline.state,
      notes: [{ id: 'actor-a-note', title: 'A', content: 'written by A' }],
      folders: [{ id: 'actor-a-folder', name: 'A folder' }],
    };
    const secondState = {
      ...secondBaseline.state,
      notes: [{ id: 'actor-b-note', title: 'B', content: 'written by B' }],
      drafts: { 'actor-b-note': [{ id: 'draft-b', text: 'B draft' }] },
    };
    await Promise.all([
      firstActor.setItem(INK, wrapper(firstState, firstBaseline.version)),
      secondActor.setItem(INK, wrapper(secondState, secondBaseline.version)),
    ]);

    const merged = await expectNativeState(firstModule, INK);
    expect(merged?.notes.map((note: any) => note.id).sort()).toEqual(['actor-a-note', 'actor-b-note']);
    expect(merged?.folders).toEqual([{ id: 'actor-a-folder', name: 'A folder' }]);
    expect(merged?.drafts).toEqual({ 'actor-b-note': [{ id: 'draft-b', text: 'B draft' }] });
    expect(pendingKeys()).toEqual([]);
  });

  it('writes a durable receipt synchronously before hydration, imports the legacy projection, and replays without replacing it', async () => {
    const native = await loadNative();
    const legacy = {
      notes: [{ id: 'legacy-note', title: 'Legacy', content: 'keep me' }],
      folders: [], drafts: {}, activeNoteId: null, activeFolder: 'All Notes',
    };
    localStorage.setItem(INK, wrapper(legacy, 4));
    const storage = native.createNativeStateStorage(INK);
    const next = { ...legacy, notes: [...legacy.notes, { id: 'new-note', title: 'New', content: 'receipt' }] };
    const write = storage.setItem(INK, wrapper(next, 4));
    const receiptKeys = pendingKeys();
    expect(receiptKeys).toHaveLength(1);
    const receipt = JSON.parse(localStorage.getItem(receiptKeys[0])!);
    expect(receipt.operations).toContainEqual(expect.objectContaining({ kind: 'row-add', field: 'notes', id: 'new-note' }));

    await write;
    const saved = await expectNativeState(native, INK);
    expect(saved?.notes.map((note: any) => note.id)).toEqual(['new-note', 'legacy-note']);
    expect(pendingKeys()).toEqual([]);
  });

  it('aborts every row of a multi-row write, then replays the retained receipt exactly once', async () => {
    const native = await loadNative();
    const storage = native.createNativeStateStorage(INK);
    await storage.getItem(INK);
    const state = {
      notes: [
        { id: 'atomic-note-1', title: 'One', content: 'one' },
        { id: 'atomic-note-2', title: 'Two', content: 'two' },
      ], folders: [], drafts: {}, activeNoteId: null, activeFolder: 'All Notes',
    };
    const prototype = IDBObjectStore.prototype as unknown as { put: (...args: any[]) => IDBRequest };
    const originalPut = prototype.put;
    let injected = false;
    prototype.put = function (this: IDBObjectStore, ...args: any[]) {
      if (!injected && this.transaction.db.name === NATIVE_STATE_DB && this.name === 'states') {
        injected = true;
        this.transaction.abort();
        throw new Error('injected states.put failure');
      }
      return originalPut.apply(this, args);
    };
    let write: Promise<void>;
    try {
      write = storage.setItem(INK, wrapper(state));
      const keys = pendingKeys();
      expect(keys).toHaveLength(1);
      expect(JSON.parse(localStorage.getItem(keys[0])!).operations.filter((op: any) => op.kind === 'row-add')).toHaveLength(2);
      await expect(write).rejects.toThrow();
    } finally {
      prototype.put = originalPut;
    }
    expect(injected).toBe(true);
    expect(await readRawState(INK)).toBeUndefined();
    expect(pendingKeys()).toHaveLength(1);
    expectNativeErrors.push('commit');

    await native.flushNativeStore(INK);
    const saved = await expectNativeState(native, INK);
    expect(saved?.notes.map((note: any) => note.id).sort()).toEqual(['atomic-note-1', 'atomic-note-2']);
    const snapshot = await native.readNativeSnapshot(INK);
    expect(snapshot.revision).toBe(1);
    await native.replayPendingNativeReceipts(INK);
    expect((await native.readNativeSnapshot(INK)).revision).toBe(1);
    expect(pendingKeys()).toEqual([]);
  });

  it('does not adopt an intermediate commit over a later optimistic edit that is still pending', async () => {
    const native = await loadNative();
    const baseline = {
      notes: [{ id: 'adoption-note', title: 'Before', content: 'base' }],
      folders: [], drafts: {}, activeNoteId: 'adoption-note', activeFolder: 'All Notes',
    };
    await native.replaceNativeStores({ [INK]: { state: baseline, version: 0 } });
    const storage = native.createNativeStateStorage(INK);
    const hydrated = JSON.parse((await storage.getItem(INK))!);
    let liveState = structuredClone(hydrated.state);
    const adoptions: Array<Record<string, unknown>> = [];
    (window as any).__inkStore = {
      getState: () => liveState,
      setState: (state: Record<string, unknown>) => {
        adoptions.push(structuredClone(state));
        liveState = { ...liveState, ...structuredClone(state) };
      },
    };

    const firstState = { ...baseline, notes: [{ ...baseline.notes[0], title: 'Committed first' }] };
    const laterState = { ...baseline, notes: [{ ...baseline.notes[0], title: 'Optimistic later' }] };
    const prototype = IDBObjectStore.prototype as unknown as { put: (...args: any[]) => IDBRequest };
    const originalPut = prototype.put;
    let stateWrites = 0;
    prototype.put = function (this: IDBObjectStore, ...args: any[]) {
      if (this.transaction.db.name === NATIVE_STATE_DB && this.name === 'states') {
        stateWrites++;
        if (stateWrites === 2) {
          this.transaction.abort();
          throw new Error('injected later receipt failure after first commit');
        }
      }
      return originalPut.apply(this, args);
    };
    try {
      const firstWrite = storage.setItem(INK, wrapper(firstState));
      liveState = structuredClone(laterState);
      const laterWrite = storage.setItem(INK, wrapper(laterState));
      const receipts = pendingKeys();
      expect(receipts).toHaveLength(2);
      await firstWrite;
      expect(liveState.notes[0].title).toBe('Optimistic later');
      expect(adoptions, 'the first transaction must not install its intermediate snapshot while the later receipt is durable')
        .toHaveLength(0);
      await expect(laterWrite).rejects.toThrow();
    } finally {
      prototype.put = originalPut;
    }
    expect(stateWrites).toBe(2);
    expect(await readRawState(INK)).toMatchObject({
      state: { notes: [{ id: 'adoption-note', title: 'Committed first', content: 'base' }] },
    });
    expectNativeErrors.push('commit');

    await native.flushNativeStore(INK);
    expect((await native.readNativeStore(INK))?.notes).toEqual(laterState.notes);
    expect(liveState.notes).toEqual(laterState.notes);
    expect(adoptions, 'the latest snapshot should be adopted after the retained receipt is replayed').toHaveLength(1);
    expect(pendingKeys()).toEqual([]);
  });

  it('keeps the legacy projection intact on migration abort and retries migration successfully', async () => {
    const native = await loadNative();
    const legacy = { notes: [{ id: 'migration-note', title: 'From old store' }], folders: [], drafts: {} };
    const raw = wrapper(legacy, 7);
    localStorage.setItem(INK, raw);
    const prototype = IDBObjectStore.prototype as unknown as { put: (...args: any[]) => IDBRequest };
    const originalPut = prototype.put;
    let injected = false;
    prototype.put = function (this: IDBObjectStore, ...args: any[]) {
      if (!injected && this.transaction.db.name === NATIVE_STATE_DB && this.name === 'states') {
        injected = true;
        this.transaction.abort();
        throw new Error('injected legacy migration failure');
      }
      return originalPut.apply(this, args);
    };
    try {
      await expect(native.readNativeSnapshot(INK)).rejects.toThrow();
    } finally {
      prototype.put = originalPut;
    }
    expect(injected).toBe(true);
    expect(localStorage.getItem(INK)).toBe(raw);
    expect(await readRawState(INK)).toBeUndefined();
    const recovered = await native.readNativeSnapshot(INK);
    expect(recovered.version).toBe(7);
    expect(recovered.state).toEqual(legacy);
    expect(localStorage.getItem(INK)).toBe(raw);
  });

  it('retains the applied guard through receipt-cleanup failure and ignores an old receipt after a newer edit', async () => {
    const native = await loadNative();
    const storage = native.createNativeStateStorage(INK);
    await storage.getItem(INK);
    const originalRemoveItem = localStorage.removeItem.bind(localStorage);
    let failReceiptCleanup = true;
    localStorage.removeItem = (key: string) => {
      if (failReceiptCleanup && key.startsWith(NATIVE_PENDING_PREFIX)) {
        failReceiptCleanup = false;
        throw new Error('injected receipt cleanup failure');
      }
      originalRemoveItem(key);
    };
    const firstState = { notes: [{ id: 'guarded-note', title: 'Old', content: 'v1' }], folders: [], drafts: {} };
    const firstWrite = storage.setItem(INK, wrapper(firstState));
    const oldReceiptKey = pendingKeys()[0];
    const oldReceiptRaw = localStorage.getItem(oldReceiptKey)!;
    try {
      await firstWrite;
    } finally {
      localStorage.removeItem = originalRemoveItem;
    }
    expect(failReceiptCleanup).toBe(false);
    const oldReceipt = JSON.parse(oldReceiptRaw);
    expect(await readRawApplied(oldReceipt.id)).toBeDefined();
    expect(localStorage.getItem(oldReceiptKey)).toBe(oldReceiptRaw);
    expectNativeErrors.push('receipt-cleanup');

    const secondState = { notes: [{ id: 'guarded-note', title: 'Newer', content: 'v2' }], folders: [], drafts: {} };
    await storage.setItem(INK, wrapper(secondState));
    const revisionAfterNewerEdit = (await native.readNativeSnapshot(INK)).revision;
    expect(revisionAfterNewerEdit).toBe(2);
    localStorage.setItem(oldReceiptKey, oldReceiptRaw);
    await native.flushNativeStore(INK);
    const current = await native.readNativeStore(INK);
    expect(current?.notes).toEqual(secondState.notes);
    expect((await native.readNativeSnapshot(INK)).revision).toBe(2);
    expect(await readRawApplied(oldReceipt.id)).toBeDefined();
    expect(localStorage.getItem(oldReceiptKey)).toBeNull();
  });

  it('rejects a stale write after replacement, then commits a fresh same-key write', async () => {
    const staleModule = await loadNative();
    const staleActor = staleModule.createNativeStateStorage(INK);
    const staleWrapper = await staleActor.getItem(INK);
    const staleState = JSON.parse(staleWrapper || wrapper({ notes: [], folders: [], drafts: {} })).state;
    staleState.notes = [...(staleState.notes ?? []), { id: 'stale-note', title: 'Old tab' }];

    vi.resetModules();
    const restoreModule = await loadNative();
    await restoreModule.replaceNativeStores({
      [INK]: { state: { notes: [{ id: 'restored-note', title: 'Restored' }], folders: [], drafts: {} }, version: 2 },
    });
    await expect(staleActor.setItem(INK, wrapper(staleState))).rejects.toThrow(/before data was restored/i);
    expectNativeErrors.push('commit');
    const current = await restoreModule.readNativeStore(INK);
    expect(current?.notes).toEqual([{ id: 'restored-note', title: 'Restored' }]);

    await restoreModule.replaceNativeStores({
      [INK]: { state: { notes: [{ id: 'second-restore', title: 'Second restore' }], folders: [], drafts: {} }, version: 3 },
    });
    const freshActor = restoreModule.createNativeStateStorage(INK);
    const freshWrapper = JSON.parse((await freshActor.getItem(INK))!);
    const freshState = {
      ...freshWrapper.state,
      notes: [...freshWrapper.state.notes, { id: 'fresh-after-stale', title: 'Fresh write' }],
    };
    await freshActor.setItem(INK, wrapper(freshState, freshWrapper.version));
    const committedNotes = (await restoreModule.readNativeStore(INK))?.notes ?? [];
    expect(committedNotes).toHaveLength(2);
    expect(committedNotes.map((note: any) => note.id).sort()).toEqual(['fresh-after-stale', 'second-restore']);
    expect(committedNotes.find((note: any) => note.id === 'fresh-after-stale')).toEqual({
      id: 'fresh-after-stale', title: 'Fresh write',
    });
  });

  it('clears Folio without fencing a pending Ink actor', async () => {
    const inkModule = await loadNative();
    await inkModule.replaceNativeStores({
      [INK]: { state: { notes: [], folders: [], drafts: {} }, version: 1 },
      [FOLIO]: { state: { terms: {}, courses: {}, commitments: [], blocks: [] }, version: 1 },
    });
    const staleInkActor = inkModule.createNativeStateStorage(INK);
    const inkBaseline = JSON.parse((await staleInkActor.getItem(INK))!);
    vi.resetModules();
    const folioModule = await loadNative();
    const folioStorage = folioModule.createNativeStateStorage(FOLIO);
    await folioStorage.getItem(FOLIO);
    await folioStorage.removeItem(FOLIO);

    const inkNext = { ...inkBaseline.state, notes: [{ id: 'ink-after-folio-clear', title: 'Survives sibling clear' }] };
    await staleInkActor.setItem(INK, wrapper(inkNext, inkBaseline.version));
    expect((await inkModule.readNativeStore(INK))?.notes).toEqual(inkNext.notes);
    expect(await folioModule.readNativeStore(FOLIO)).toBeNull();
  });

  it('commits a new write after clearing the same native store and hydrates it in a fresh module', async () => {
    const firstModule = await loadNative();
    await firstModule.replaceNativeStores({
      [INK]: { state: { notes: [{ id: 'before-clear', title: 'Before' }], folders: [], drafts: {} }, version: 1 },
    });
    const storage = firstModule.createNativeStateStorage(INK);
    const before = JSON.parse((await storage.getItem(INK))!);
    const beforeSnapshot = await firstModule.readNativeSnapshot(INK);

    await storage.removeItem(INK);
    expect(await firstModule.readNativeStore(INK)).toBeNull();

    const afterClear = {
      notes: [{ id: 'after-clear', title: 'After' }],
      folders: [],
      drafts: {},
    };
    await storage.setItem(INK, wrapper(afterClear, before.version));
    const committed = await firstModule.readNativeSnapshot(INK);
    expect(committed.state.notes).toEqual(afterClear.notes);
    expect(committed.keyGeneration).toBeGreaterThan(beforeSnapshot.keyGeneration);

    vi.resetModules();
    const freshModule = await loadNative();
    expect((await freshModule.readNativeStore(INK))?.notes).toEqual(afterClear.notes);
  });

  it('rejects flush when a pending receipt journal entry is malformed', async () => {
    const native = await loadNative();
    localStorage.setItem(`${NATIVE_PENDING_PREFIX}corrupt`, '{not valid JSON');
    await expect(native.flushNativeStore(INK)).rejects.toThrow(/pending native receipt is malformed/i);
    expect(native.hasPendingNativeReceipts(INK)).toBe(true);
  });

  it('ignores a valid sibling-store receipt during a key-scoped flush', async () => {
    const native = await loadNative();
    localStorage.setItem(`${NATIVE_PENDING_PREFIX}sibling`, JSON.stringify({
      id: 'sibling', key: FOLIO, generation: 1, keyGeneration: 1,
      baseRevision: 0, version: 1, operations: [], createdAt: Date.now(), sequence: 1,
    }));
    await expect(native.flushNativeStore(INK)).resolves.toBeUndefined();
    expect(native.hasPendingNativeReceipts(INK)).toBe(false);
    expect(native.hasPendingNativeReceipts(FOLIO)).toBe(true);
  });
});
