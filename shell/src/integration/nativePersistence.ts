/* Native Ink and Planning persistence.

   localStorage remains the synchronous receipt and compatibility projection;
   IndexedDB is the authoritative merged snapshot. Each user mutation writes a
   compact delta receipt synchronously, then commits that delta in one
   cross-tab serialized IndexedDB transaction. A receipt is removed only after
   the transaction commits, so a reload can replay an interrupted write. */

export const NATIVE_STATE_DB = 'iterra-native-state';
export const NATIVE_STATE_DB_VERSION = 1;
export const NATIVE_PENDING_PREFIX = 'iterra.native.pending.';
export const NATIVE_STATE_KEYS = ['ink-notes-storage', 'syllabus.folio.v1'] as const;
export type NativeStateKey = typeof NATIVE_STATE_KEYS[number];

const STATES = 'states';
const RECEIPTS = 'receipts';
const META = 'meta';
const APPLIED = 'applied';

type JsonObject = Record<string, any>;
export interface NativeDeltaOperation {
  kind: 'root' | 'map-set' | 'map-patch' | 'map-delete' | 'row-add' | 'row-patch' | 'row-delete';
  field: string;
  id?: string;
  value?: unknown;
  basePresent?: boolean;
  patch?: JsonObject;
  remove?: string[];
  baseRevision: number;
}

export interface NativeStateRow {
  key: NativeStateKey;
  state: JsonObject;
  version: number;
  revision: number;
  recordRevisions: Record<string, number>;
}

interface NativeReceipt {
  id: string;
  key: NativeStateKey;
  generation: number;
  keyGeneration: number;
  baseRevision: number;
  version: number;
  operations: NativeDeltaOperation[];
  createdAt: number;
  sequence: number;
}

interface NativeMeta { key: string; value: number }
interface AppliedReceipt { id: string; generation: number; appliedRevision: number; stale?: boolean }
export interface NativeSnapshot {
  key: NativeStateKey;
  state: JsonObject;
  version: number;
  revision: number;
  generation: number;
  keyGeneration: number;
  recordRevisions: Record<string, number>;
}

const snapshots = new Map<NativeStateKey, NativeSnapshot>();
const baselineListeners = new Map<NativeStateKey, Set<(snapshot: NativeSnapshot) => void>>();
const queues = new Map<NativeStateKey, Promise<void>>();
const errors = new Map<NativeStateKey, Error>();
const errorPhases = new Map<NativeStateKey, string>();
const hydration = new Map<NativeStateKey, Promise<NativeSnapshot>>();
let dbPromise: Promise<IDBDatabase> | null = null;
let receiptSequence = 0;
const TAB_CONTEXT_KEY: Record<NativeStateKey, string> = {
  'ink-notes-storage': 'iterra.native.context.ink',
  'syllabus.folio.v1': 'iterra.native.context.syllabus',
};
const TAB_CONTEXT_FIELDS: Record<NativeStateKey, string[]> = {
  'ink-notes-storage': ['activeNoteId', 'activeFolder'],
  'syllabus.folio.v1': ['activeTermId'],
};

const clone = <T,>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const stateKey = (field: string, id?: string) => `${field}${id === undefined ? '' : `:${id}`}`;

function reportNativeError(key: NativeStateKey, error: unknown, phase: string) {
  const err = error instanceof Error ? error : new Error(String(error));
  errors.set(key, err);
  errorPhases.set(key, phase);
  try {
    window.dispatchEvent(new CustomEvent('iterra:native-persistence-error', {
      detail: { key, phase, message: err.message },
    }));
  } catch { /* test and worker contexts may not have a DOM */ }
}

function reportStaleGeneration(key: NativeStateKey) {
  try {
    window.dispatchEvent(new CustomEvent('iterra:native-state-restored', { detail: { key, stale: true } }));
  } catch { /* best effort */ }
}

function reportNativePending(key: NativeStateKey) {
  try { window.dispatchEvent(new CustomEvent('iterra:native-persistence-pending', { detail: { key } })); } catch { /* best effort */ }
}

function reportNativeSaved(key: NativeStateKey) {
  try { window.dispatchEvent(new CustomEvent('iterra:native-persistence-saved', { detail: { key } })); } catch { /* best effort */ }
}

function openNativeDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const opening: Promise<IDBDatabase> = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable for native data persistence.'));
      return;
    }
    let request: IDBOpenDBRequest;
    try { request = indexedDB.open(NATIVE_STATE_DB, NATIVE_STATE_DB_VERSION); }
    catch (error) { reject(error); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STATES)) db.createObjectStore(STATES, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(RECEIPTS)) db.createObjectStore(RECEIPTS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(APPLIED)) db.createObjectStore(APPLIED, { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('Could not open native persistence database.'));
    request.onblocked = () => reject(new Error('Native persistence database upgrade is blocked by another tab.'));
  }).catch(error => { dbPromise = null; throw error; });
  dbPromise = opening;
  return opening;
}

function parseWrapper(raw: string | null): { state: JsonObject; version: number } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const state = parsed.state && typeof parsed.state === 'object' ? parsed.state : parsed;
    if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
    return { state: clone(state), version: Number.isInteger(parsed.version) ? parsed.version : 0 };
  } catch { return null; }
}

function makeWrapper(snapshot: NativeSnapshot): string {
  return JSON.stringify({ state: snapshot.state, version: snapshot.version,
    __nativeRevision: snapshot.revision, __nativeGeneration: snapshot.generation,
    __nativeKeyGeneration: snapshot.keyGeneration });
}

function validContext(key: NativeStateKey, state: JsonObject, context: JsonObject, hasTabContext: boolean): JsonObject {
  const next = { ...state };
  if (key === 'ink-notes-storage') {
    const notes = Array.isArray(state.notes) ? state.notes : [];
    const validNote = (id: unknown) => typeof id === 'string' && notes.some(note => note?.id === id && !note.trashedAt);
    if (hasTabContext && 'activeNoteId' in context) next.activeNoteId = validNote(context.activeNoteId) ? context.activeNoteId : null;
    else if (!validNote(state.activeNoteId)) next.activeNoteId = null;

    const folders = Array.isArray(state.folders) ? state.folders : [];
    const folderExists = (name: unknown) => typeof name === 'string' &&
      (['All Notes', 'Untagged', 'Unfiled'].includes(name) || folders.some(folder => folder?.name === name));
    if (hasTabContext && 'activeFolder' in context) next.activeFolder = folderExists(context.activeFolder) ? context.activeFolder : 'All Notes';
    else if (!folderExists(state.activeFolder)) next.activeFolder = 'All Notes';
  } else {
    const terms = isPlainObject(state.terms) ? state.terms : {};
    const validTerm = (id: unknown) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(terms, id);
    if (hasTabContext && 'activeTermId' in context) next.activeTermId = validTerm(context.activeTermId) ? context.activeTermId : null;
    else if (!validTerm(state.activeTermId)) next.activeTermId = null;
  }
  return next;
}

function readTabContext(key: NativeStateKey): { context: JsonObject; exists: boolean } {
  try {
    const raw = sessionStorage.getItem(TAB_CONTEXT_KEY[key]);
    if (raw) {
      const context = JSON.parse(raw);
      if (isPlainObject(context)) return { context, exists: true };
    }
  } catch { /* unavailable storage falls back to shared initial selection */ }
  return { context: {}, exists: false };
}

function rememberTabContext(key: NativeStateKey, state: JsonObject) {
  const context: JsonObject = {};
  for (const field of TAB_CONTEXT_FIELDS[key]) if (field in state) context[field] = state[field];
  try { sessionStorage.setItem(TAB_CONTEXT_KEY[key], JSON.stringify(context)); }
  catch (error) { reportNativeError(key, error, 'tab-context'); }
}

function withoutTabContext(key: NativeStateKey, state: JsonObject): JsonObject {
  const next = { ...state };
  for (const field of TAB_CONTEXT_FIELDS[key]) delete next[field];
  return next;
}

function registerBaseline(key: NativeStateKey, listener: (snapshot: NativeSnapshot) => void) {
  const listeners = baselineListeners.get(key) ?? new Set();
  listeners.add(listener);
  baselineListeners.set(key, listeners);
}

function adoptCommittedSnapshot(key: NativeStateKey, snapshot: NativeSnapshot) {
  const context = readTabContext(key);
  const rendered = { ...clone(snapshot), state: validContext(key, snapshot.state, context.context, context.exists) };
  rememberTabContext(key, rendered.state);
  for (const listener of baselineListeners.get(key) ?? []) listener(clone(rendered));
  if (typeof window === 'undefined') return;
  const storeName = key === 'ink-notes-storage' ? '__inkStore' : '__syllabusFolioStore';
  const store = (window as any)?.[storeName];
  try { store?.setState?.(rendered.state); } catch { /* state remains available for rehydrate */ }
}

async function projectSnapshot(snapshot: NativeSnapshot): Promise<boolean> {
  try {
    // A callback can run after a later reset/restore transaction has already
    // committed. Recheck authority before projecting so an old completion
    // cannot recreate a cleared compatibility blob in another tab.
    const db = await openNativeDb();
    const currentNative = await new Promise<{ row?: NativeStateRow; generation: number; keyGeneration: number }>((resolve, reject) => {
      const tx = db.transaction([STATES, META], 'readonly');
      const rowReq = tx.objectStore(STATES).get(snapshot.key);
      const genReq = tx.objectStore(META).get('generation');
      const keyGenReq = tx.objectStore(META).get(`generation:${snapshot.key}`);
      let row: NativeStateRow | undefined;
      let done = 0;
      const finish = () => {
        if (++done === 3) {
          const generation = genReq.result?.value ?? 1;
          const keyGeneration = keyGenReq.result?.value ?? generation;
          resolve({ row, generation, keyGeneration });
        }
      };
      rowReq.onsuccess = () => { row = rowReq.result; finish(); };
      genReq.onsuccess = finish;
      keyGenReq.onsuccess = finish;
      rowReq.onerror = genReq.onerror = keyGenReq.onerror = () => tx.abort();
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Could not verify native projection revision.'));
    });
    if (!currentNative.row || currentNative.generation !== snapshot.generation ||
      currentNative.keyGeneration !== snapshot.keyGeneration || currentNative.row.revision !== snapshot.revision) return false;

    const current = parseWrapper(localStorage.getItem(snapshot.key));
    let currentRevision = 0;
    let currentGeneration = 0;
    try {
      const raw = JSON.parse(localStorage.getItem(snapshot.key) || 'null');
      currentRevision = Number.isInteger(raw?.__nativeRevision) ? raw.__nativeRevision : 0;
      currentGeneration = Number.isInteger(raw?.__nativeGeneration) ? raw.__nativeGeneration : 0;
    } catch { /* legacy wrapper has no ordering metadata */ }
    let currentKeyGeneration = currentGeneration;
    try {
      const raw = JSON.parse(localStorage.getItem(snapshot.key) || 'null');
      if (Number.isInteger(raw?.__nativeKeyGeneration)) currentKeyGeneration = raw.__nativeKeyGeneration;
    } catch { /* legacy wrapper has no ordering metadata */ }
    if (current && (currentGeneration > snapshot.generation ||
      (currentGeneration === snapshot.generation && currentKeyGeneration > snapshot.keyGeneration) ||
      (currentGeneration === snapshot.generation && currentKeyGeneration === snapshot.keyGeneration && currentRevision > snapshot.revision))) return false;
    localStorage.setItem(snapshot.key, makeWrapper(snapshot));
    return true;
  } catch (error) {
    // IDB remains authoritative and the receipt is committed. The warning is
    // explicit; all native readers use this module rather than the projection.
    reportNativeError(snapshot.key, error, 'projection');
    return false;
  }
}

export function diffNativeState(
  _key: NativeStateKey,
  before: JsonObject,
  after: JsonObject,
  recordRevisions: Record<string, number> = {},
): NativeDeltaOperation[] {
  const operations: NativeDeltaOperation[] = [];
  const fields = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const field of fields) {
    const oldValue = before?.[field];
    const newValue = after?.[field];
    if (same(oldValue, newValue)) continue;

    if (Array.isArray(oldValue) || Array.isArray(newValue)) {
      const oldRows = Array.isArray(oldValue) ? oldValue : [];
      const newRows = Array.isArray(newValue) ? newValue : [];
      const keyed = [...oldRows, ...newRows].every(row => row && typeof row === 'object' && typeof row.id === 'string');
      if (keyed) {
        const oldMap = new Map(oldRows.map(row => [row.id, row]));
        const newMap = new Map(newRows.map(row => [row.id, row]));
        diffRows(field, oldMap, newMap, recordRevisions, operations);
      } else {
        operations.push({ kind: 'root', field, value: clone(newValue), baseRevision: recordRevisions[stateKey(field)] ?? 0 });
      }
      continue;
    }

    if (isPlainObject(oldValue) || isPlainObject(newValue)) {
      const oldMap = isPlainObject(oldValue) ? oldValue : {};
      const newMap = isPlainObject(newValue) ? newValue : {};
      const ids = new Set([...Object.keys(oldMap), ...Object.keys(newMap)]);
      for (const id of ids) {
        if (same(oldMap[id], newMap[id])) continue;
        const revKey = stateKey(field, id);
        if (!(id in newMap)) {
          operations.push({ kind: 'map-delete', field, id, basePresent: true, baseRevision: recordRevisions[revKey] ?? 0 });
        } else if (id in oldMap && isPlainObject(oldMap[id]) && isPlainObject(newMap[id])) {
          const patch: JsonObject = {};
          const remove: string[] = [];
          for (const property of new Set([...Object.keys(oldMap[id]), ...Object.keys(newMap[id])])) {
            if (same(oldMap[id][property], newMap[id][property])) continue;
            if (!(property in newMap[id])) remove.push(property);
            else patch[property] = clone(newMap[id][property]);
          }
          operations.push({ kind: 'map-patch', field, id, patch, remove,
            basePresent: true, baseRevision: recordRevisions[revKey] ?? 0 });
        } else {
          operations.push({ kind: 'map-set', field, id, value: clone(newMap[id]), basePresent: id in oldMap, baseRevision: recordRevisions[revKey] ?? 0 });
        }
      }
      continue;
    }

    operations.push({ kind: 'root', field, value: clone(newValue), baseRevision: recordRevisions[stateKey(field)] ?? 0 });
  }
  return operations;
}

/**
 * Zustand can call storage.setItem before its async getItem has completed.
 * In that window the store may still contain only its defaults. Treat that
 * snapshot as additive: retain all projected values and accept only missing
 * roots/map entries/keyed rows. Existing values can only be edited or deleted
 * once hydration has established an exact baseline.
 */
export function mergeUnhydratedNativeState(key: NativeStateKey, projected: JsonObject, incoming: JsonObject): JsonObject {
  const merged = clone(projected ?? {});
  for (const [field, value] of Object.entries(incoming ?? {})) {
    if (value === undefined || same(merged[field], value)) continue;
    const current = merged[field];
    if (isPlainObject(value)) {
      const map = isPlainObject(current) ? { ...current } : {};
      for (const [id, entry] of Object.entries(value)) {
        if (!Object.prototype.hasOwnProperty.call(map, id)) map[id] = clone(entry);
      }
      merged[field] = map;
      continue;
    }
    if (Array.isArray(value)) {
      const rows = Array.isArray(current) ? current : [];
      const keyed = [...rows, ...value].every(row => row && typeof row === 'object' && typeof row.id === 'string');
      if (keyed) {
        const byId = new Map(rows.map(row => [row.id, row]));
        for (const row of value) {
          // Ink's welcome page is a store seed, not a user-created record.
          // An unhydrated default store must not recreate it after a user
          // intentionally removed it from a previously saved workspace.
          if (key === 'ink-notes-storage' && field === 'notes' && row.id === 'welcome' && !byId.has(row.id)) continue;
          if (!byId.has(row.id)) byId.set(row.id, clone(row));
        }
        merged[field] = [...byId.values()];
      } else if (!Array.isArray(current) || current.length === 0) {
        merged[field] = clone(value);
      }
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(merged, field)) merged[field] = clone(value);
  }
  return merged;
}

function isPlainObject(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function diffRows(
  field: string,
  before: Map<string, any>,
  after: Map<string, any>,
  recordRevisions: Record<string, number>,
  operations: NativeDeltaOperation[],
) {
  const ids = new Set([...before.keys(), ...after.keys()]);
  for (const id of ids) {
    const oldRow = before.get(id);
    const newRow = after.get(id);
    if (same(oldRow, newRow)) continue;
    const revKey = `${field}:${id}`;
    if (newRow === undefined) {
      operations.push({ kind: 'row-delete', field, id, baseRevision: recordRevisions[revKey] ?? 0 });
    } else if (oldRow === undefined) {
      operations.push({ kind: 'row-add', field, id, value: clone(newRow), baseRevision: recordRevisions[revKey] ?? 0 });
    } else {
      const patch: JsonObject = {};
      const remove: string[] = [];
      for (const k of new Set([...Object.keys(oldRow), ...Object.keys(newRow)])) {
        if (same(oldRow[k], newRow[k])) continue;
        if (!(k in newRow)) remove.push(k);
        else patch[k] = clone(newRow[k]);
      }
      operations.push({ kind: 'row-patch', field, id, patch, remove, baseRevision: recordRevisions[revKey] ?? 0 });
    }
  }
}

export function applyNativeDelta(
  source: JsonObject,
  sourceRevisions: Record<string, number>,
  _key: NativeStateKey,
  operations: NativeDeltaOperation[],
): { state: JsonObject; recordRevisions: Record<string, number> } {
  const state = clone(source ?? {});
  const recordRevisions = { ...(sourceRevisions ?? {}) };
  for (const operation of operations) {
    const { kind, field, id } = operation;
    if (kind === 'root') {
      if (operation.value === undefined) delete state[field];
      else state[field] = clone(operation.value);
      recordRevisions[stateKey(field)] = (recordRevisions[stateKey(field)] ?? 0) + 1;
      continue;
    }

    if (kind === 'map-set' || kind === 'map-patch' || kind === 'map-delete') {
      const map = isPlainObject(state[field]) ? { ...state[field] } : {};
      const revisionKey = stateKey(field, id);
      if (kind === 'map-delete') delete map[id!];
      else if (kind === 'map-patch') {
        if (!Object.prototype.hasOwnProperty.call(map, id!)) continue;
        const value = isPlainObject(map[id!]) ? { ...map[id!] } : {};
        Object.assign(value, clone(operation.patch ?? {}));
        for (const property of operation.remove ?? []) delete value[property];
        map[id!] = value;
      }
      else {
        // An old page cannot recreate a map entry after a delete. New unique
        // IDs still merge; same-ID duplicate creation keeps the first row.
        const currentExists = Object.prototype.hasOwnProperty.call(map, id!);
        const rowRevision = recordRevisions[revisionKey] ?? 0;
        if (operation.basePresent) {
          if (!currentExists) continue;
        } else if (currentExists || rowRevision > 0) continue;
        map[id!] = clone(operation.value);
      }
      state[field] = map;
      recordRevisions[revisionKey] = (recordRevisions[revisionKey] ?? 0) + 1;
      continue;
    }

    const rows: any[] = Array.isArray(state[field]) ? [...state[field]] : [];
    const index = rows.findIndex(row => row?.id === id);
    const revKey = `${field}:${id}`;
    const rowRevision = recordRevisions[revKey] ?? 0;
    if (kind === 'row-delete') {
      if (index >= 0) rows.splice(index, 1);
    } else if (kind === 'row-add') {
      // A retried ID is idempotent. A deleted ID is tombstoned by its revision
      // and cannot be silently recreated by a stale tab.
      if (index >= 0 || rowRevision > 0) continue;
      rows.unshift(clone(operation.value));
    } else {
      // Patch only changed fields: a stale edit of title/content must preserve
      // a concurrent trash flag or another tab's unrelated field changes.
      if (index < 0) continue;
      const row = { ...rows[index], ...(operation.patch ?? {}) };
      for (const remove of operation.remove ?? []) delete row[remove];
      rows[index] = row;
    }
    state[field] = rows;
    recordRevisions[revKey] = rowRevision + 1;
  }
  return { state, recordRevisions };
}

function receiptId(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

function localReceiptKey(id: string) { return `${NATIVE_PENDING_PREFIX}${id}`; }

function readPendingReceipts(key?: NativeStateKey): NativeReceipt[] {
  const receipts: NativeReceipt[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const storageKey = localStorage.key(i) ?? '';
    if (!storageKey.startsWith(NATIVE_PENDING_PREFIX)) continue;
    const raw = localStorage.getItem(storageKey);
    if (!raw) continue;
    try {
      const receipt = JSON.parse(raw) as NativeReceipt;
      if (!receipt?.id || !NATIVE_STATE_KEYS.includes(receipt.key) || !Array.isArray(receipt.operations)) {
        throw new Error(`A pending native receipt is invalid: ${storageKey}`);
      }
      // A key-scoped flush must ignore valid receipts belonging to the other
      // native store; they remain durable for that store's later flush.
      if (!key || receipt.key === key) receipts.push(receipt);
    } catch { throw new Error(`A pending native receipt is malformed: ${storageKey}`); }
  }
  return receipts.sort((a, b) => a.createdAt - b.createdAt || a.sequence - b.sequence || a.id.localeCompare(b.id));
}

export function hasPendingNativeReceipts(key: NativeStateKey): boolean {
  try { return readPendingReceipts(key).length > 0; }
  catch { return true; }
}

export function getNativePersistenceError(key: NativeStateKey): Error | null {
  return errors.get(key) ?? null;
}

export function getNativePersistenceErrorPhase(key: NativeStateKey): string | null {
  return errorPhases.get(key) ?? null;
}

function applyReceipt(receipt: NativeReceipt): Promise<'applied' | 'already-applied' | 'stale'> {
  return openNativeDb().then(db => new Promise<'applied' | 'already-applied' | 'stale'>((resolve, reject) => {
    let outcome: 'applied' | 'already-applied' | 'stale' = 'applied';
    let projected: NativeSnapshot | null = null;
    let projectionOk = true;
    let tx: IDBTransaction;
    try { tx = db.transaction([STATES, RECEIPTS, META, APPLIED], 'readwrite'); }
    catch (error) { reject(error); return; }
    const states = tx.objectStore(STATES);
    const receiptStore = tx.objectStore(RECEIPTS);
    const meta = tx.objectStore(META);
    const applied = tx.objectStore(APPLIED);
    const stateRequest = states.get(receipt.key);
    const generationRequest = meta.get('generation');
    const keyGenerationRequest = meta.get(`generation:${receipt.key}`);
    const priorRequest = applied.get(receipt.id);
    let ready = 0;
    let row: NativeStateRow | undefined;
    let generation = 1;
    let keyGeneration = 1;
    let prior: AppliedReceipt | undefined;
    const applyWhenReady = () => {
      if (++ready < 4) return;
      if (prior) {
        outcome = prior.stale ? 'stale' : 'already-applied';
        if (!prior.stale && row) {
          generation = generationRequest.result?.value ?? 1;
          keyGeneration = keyGenerationRequest.result?.value ?? generation;
          projected = { ...row, generation, keyGeneration };
        }
        return;
      }
      generation = generationRequest.result?.value ?? 1;
      if (generationRequest.result === undefined) meta.put({ key: 'generation', value: generation } satisfies NativeMeta);
      keyGeneration = keyGenerationRequest.result?.value ?? generation;
      if (keyGenerationRequest.result === undefined) meta.put({ key: `generation:${receipt.key}`, value: keyGeneration } satisfies NativeMeta);
      if (receipt.generation !== generation || receipt.keyGeneration !== keyGeneration) {
        outcome = 'stale';
        applied.put({ id: receipt.id, generation, appliedRevision: row?.revision ?? 0, stale: true } satisfies AppliedReceipt);
        receiptStore.put({ ...receipt, status: 'stale' });
        return;
      }
      const base: NativeStateRow = row ?? { key: receipt.key, state: {}, version: 0, revision: 0, recordRevisions: {} };
      const merged = applyNativeDelta(base.state, base.recordRevisions, receipt.key, receipt.operations);
      const next: NativeStateRow = {
        ...base,
        key: receipt.key,
        state: merged.state,
        version: row?.version ?? 0,
        revision: base.revision + 1,
        recordRevisions: merged.recordRevisions,
      };
      // A stale tab can finish a lower-version receipt after a newer build
      // has already migrated the same native row. State deltas still merge,
      // but the persisted schema version only moves forward.
      next.version = Math.max(next.version, receipt.version);
      const put = states.put(next);
      projected = { ...next, generation, keyGeneration };
      applied.put({ id: receipt.id, generation, appliedRevision: next.revision } satisfies AppliedReceipt);
      receiptStore.put({ ...receipt, status: 'applied' });
      put.onerror = () => tx.abort();
    };
    stateRequest.onsuccess = () => { row = stateRequest.result; applyWhenReady(); };
    generationRequest.onsuccess = applyWhenReady;
    keyGenerationRequest.onsuccess = applyWhenReady;
    priorRequest.onsuccess = () => { prior = priorRequest.result; applyWhenReady(); };
    stateRequest.onerror = generationRequest.onerror = keyGenerationRequest.onerror = priorRequest.onerror = () => tx.abort();
    tx.oncomplete = () => {
      let removed = false;
      try {
        localStorage.removeItem(localReceiptKey(receipt.id));
        removed = localStorage.getItem(localReceiptKey(receipt.id)) === null;
      } catch (error) { reportNativeError(receipt.key, error, 'receipt-cleanup'); }
      if (removed) cleanupReceiptPayload(receipt.id).catch(error => reportNativeError(receipt.key, error, 'receipt-cleanup'));
      if (projected) {
        void (async () => {
          projectionOk = await projectSnapshot(projected!);
          if (projectionOk) {
            snapshots.set(receipt.key, { ...projected!, recordRevisions: { ...projected!.recordRevisions } });
            const morePending = hasOtherPendingReceipts(receipt.key, receipt.id);
            if (!morePending) {
              adoptCommittedSnapshot(receipt.key, projected!);
              errors.delete(receipt.key);
              errorPhases.delete(receipt.key);
              reportNativeSaved(receipt.key);
            } else reportNativePending(receipt.key);
          }
          resolve(outcome);
        })().catch(error => {
          reportNativeError(receipt.key, error, 'projection');
          resolve(outcome);
        });
        return;
      }
      if (outcome === 'stale') {
        reportStaleGeneration(receipt.key);
      } else if (hasOtherPendingReceipts(receipt.key, receipt.id)) reportNativePending(receipt.key);
      else reportNativeSaved(receipt.key);
      resolve(outcome);
    };
    tx.onerror = () => reject(tx.error ?? new Error('Native state transaction failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('Native state transaction aborted.'));
  }));
}

function hasOtherPendingReceipts(key: NativeStateKey, currentId: string): boolean {
  try { return readPendingReceipts(key).some(receipt => receipt.id !== currentId); }
  catch (error) { reportNativeError(key, error, 'receipt-read'); return true; }
}

function cleanupReceiptPayload(id: string): Promise<void> {
  return openNativeDb().then(db => new Promise((resolve, reject) => {
    // Applied IDs remain as compact replay guards. This matters when two tabs
    // loaded the same pending receipt before either one removed it.
    const tx = db.transaction(RECEIPTS, 'readwrite');
    tx.objectStore(RECEIPTS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Could not clean native receipt marker.'));
  }));
}

async function importLegacyIfNeeded(key: NativeStateKey): Promise<NativeSnapshot> {
  const db = await openNativeDb();
  const legacy = parseWrapper(localStorage.getItem(key));
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try { tx = db.transaction([STATES, META], 'readwrite'); }
    catch (error) { reject(error); return; }
    const states = tx.objectStore(STATES);
    const meta = tx.objectStore(META);
    const stateReq = states.get(key);
    const genReq = meta.get('generation');
    const keyGenReq = meta.get(`generation:${key}`);
    let result: NativeSnapshot | null = null;
    let loaded = 0;
    const finish = () => {
      if (++loaded < 3) return;
      const generation = genReq.result?.value ?? 1;
      if (genReq.result === undefined) meta.put({ key: 'generation', value: generation } satisfies NativeMeta);
      const keyGeneration = keyGenReq.result?.value ?? generation;
      if (keyGenReq.result === undefined) meta.put({ key: `generation:${key}`, value: keyGeneration } satisfies NativeMeta);
      const existing = stateReq.result as NativeStateRow | undefined;
      if (existing) result = { ...existing, generation, keyGeneration };
      else if (legacy) {
        const row: NativeStateRow = { key, state: legacy.state, version: legacy.version, revision: 0, recordRevisions: {} };
        states.put(row);
        result = { ...row, generation, keyGeneration };
      } else {
        result = { key, state: {}, version: 0, revision: 0, generation, keyGeneration, recordRevisions: {} };
      }
    };
    stateReq.onsuccess = genReq.onsuccess = keyGenReq.onsuccess = finish;
    stateReq.onerror = genReq.onerror = keyGenReq.onerror = () => tx.abort();
    tx.oncomplete = () => { resolve(result!); };
    tx.onerror = () => reject(tx.error ?? new Error('Native state migration failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('Native state migration aborted.'));
  });
}

export async function replayPendingNativeReceipts(key?: NativeStateKey): Promise<void> {
  if (key) { await flushNativeStore(key); return; }
  for (const nativeKey of NATIVE_STATE_KEYS) await flushNativeStore(nativeKey);
}

async function loadSnapshot(key: NativeStateKey): Promise<NativeSnapshot> {
  const waiting = hydration.get(key);
  if (waiting) return waiting;
  const task = (async () => {
    const snapshot = await importLegacyIfNeeded(key);
    await flushNativeStore(key);
    const db = await openNativeDb();
    const current = await new Promise<NativeStateRow | undefined>((resolve, reject) => {
      const tx = db.transaction([STATES, META], 'readonly');
      const rowReq = tx.objectStore(STATES).get(key);
      const genReq = tx.objectStore(META).get('generation');
      const keyGenReq = tx.objectStore(META).get(`generation:${key}`);
      let row: NativeStateRow | undefined;
      let generation = snapshot.generation;
      let keyGeneration = snapshot.keyGeneration;
      let count = 0;
      const finish = () => { if (++count === 3) {
        generation = genReq.result?.value ?? generation;
        keyGeneration = keyGenReq.result?.value ?? keyGeneration;
        resolve(row ? { ...row, generation, keyGeneration } as NativeStateRow : undefined);
      } };
      rowReq.onsuccess = () => { row = rowReq.result; finish(); };
      genReq.onsuccess = finish;
      keyGenReq.onsuccess = finish;
      rowReq.onerror = genReq.onerror = keyGenReq.onerror = () => reject(tx.error ?? new Error('Could not read native state.'));
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Could not read native state.'));
    });
    const value: NativeSnapshot = current
      ? { ...current, generation: (current as any).generation ?? snapshot.generation,
        keyGeneration: (current as any).keyGeneration ?? snapshot.keyGeneration,
        recordRevisions: { ...(current.recordRevisions ?? {}) } }
      : snapshot;
    snapshots.set(key, clone(value));
    return value;
  })().finally(() => hydration.delete(key));
  hydration.set(key, task);
  return task;
}

function makeReceipt(key: NativeStateKey, before: NativeSnapshot, afterState: JsonObject, version: number): NativeReceipt {
  const operations = diffNativeState(key, before.state, afterState, before.recordRevisions);
  return {
    id: receiptId(), key, generation: before.generation, keyGeneration: before.keyGeneration,
    baseRevision: before.revision, version,
    operations, createdAt: Date.now(), sequence: ++receiptSequence,
  };
}

function projectedEpoch(key: NativeStateKey): Pick<NativeSnapshot, 'revision' | 'generation' | 'keyGeneration'> {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return {
      revision: Number.isInteger(value?.__nativeRevision) ? value.__nativeRevision : 0,
      generation: Number.isInteger(value?.__nativeGeneration) ? value.__nativeGeneration : 1,
      keyGeneration: Number.isInteger(value?.__nativeKeyGeneration) ? value.__nativeKeyGeneration :
        (Number.isInteger(value?.__nativeGeneration) ? value.__nativeGeneration : 1),
    };
  } catch { return { revision: 0, generation: 1, keyGeneration: 1 }; }
}

function persistReceipt(receipt: NativeReceipt): Promise<void> {
  try {
    localStorage.setItem(localReceiptKey(receipt.id), JSON.stringify(receipt));
    reportNativePending(receipt.key);
  } catch (error) {
    reportNativeError(receipt.key, error, 'receipt');
    throw error;
  }
  const previous = queues.get(receipt.key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const outcome = await applyReceipt(receipt);
    if (outcome === 'stale') throw new Error('This tab was opened before data was restored. Reload before editing again.');
  });
  queues.set(receipt.key, next);
  const observed = next.catch(error => { reportNativeError(receipt.key, error, 'commit'); });
  // Keep the observable storage promise handled; flushNativeStore retains the
  // original queue rejection and reports it to callers that need an ack.
  void observed;
  return next;
}

export function createNativeStateStorage(key: NativeStateKey): {
  getItem(name: string): Promise<string | null>;
  setItem(name: string, value: string): Promise<void>;
  removeItem(name: string): Promise<void>;
} {
  let before: NativeSnapshot | null = null;
  let ready: Promise<void> | null = null;
  let earlyState: JsonObject | null = null;
  registerBaseline(key, snapshot => { before = clone(snapshot); earlyState = null; });
  return {
    getItem: async () => {
      try {
        const snapshot = await loadSnapshot(key);
        const savedContext = readTabContext(key);
        snapshot.state = validContext(key, snapshot.state, savedContext.context, savedContext.exists);
        rememberTabContext(key, snapshot.state);
        before = clone(snapshot);
        if (errorPhases.get(key) === 'hydrate') {
          errors.delete(key);
          errorPhases.delete(key);
          reportNativeSaved(key);
        }
        return snapshot.revision || Object.keys(snapshot.state).length
          ? makeWrapper(snapshot)
          : null;
      } catch (error) {
        reportNativeError(key, error, 'hydrate');
        throw error;
      }
    },
    setItem: (_name, value) => {
      const parsed = parseWrapper(value);
      if (!parsed) throw new Error(`Invalid persisted state for ${key}.`);
      if (before) {
        const base = clone(before);
        try {
          rememberTabContext(key, parsed.state);
          const receipt = makeReceipt(key, { ...base, state: withoutTabContext(key, base.state) }, withoutTabContext(key, parsed.state), parsed.version);
          // The durable recovery receipt is written in this synchronous call
          // before Zustand's public mutation returns its generated ID.
          if (!receipt.operations.length && receipt.version <= base.version) return Promise.resolve();
          localStorage.setItem(localReceiptKey(receipt.id), JSON.stringify(receipt));
          reportNativePending(key);
          before = { ...base, state: clone(parsed.state), version: parsed.version,
            recordRevisions: optimisticRevisions(key, base.recordRevisions, receipt.operations) };
          return enqueueCommittedReceipt(receipt);
        } catch (error) {
          reportNativeError(key, error, 'receipt');
          throw error;
        }
      }
      // Before hydration, only diff against this tab's prior optimistic state
      // (or an empty baseline on its first write). Never interpret absent
      // persisted rows as deletes. The receipt is still durable synchronously.
      rememberTabContext(key, parsed.state);
      const epoch = projectedEpoch(key);
      // The current projection is the only synchronous baseline available
      // before Zustand hydration. Starting from it lets the receipt carry
      // deltas for the legacy workspace instead of accidentally replacing it
      // with an empty root if this write races first hydration.
      const projected = parseWrapper(localStorage.getItem(key));
      const projectedState = earlyState ?? projected?.state ?? {};
      const mergedState = mergeUnhydratedNativeState(key, projectedState, parsed.state);
      const emptyBase: NativeSnapshot = {
        key, state: projectedState, version: parsed.version, ...epoch, recordRevisions: {},
      };
      const receipt = makeReceipt(key, emptyBase, withoutTabContext(key, mergedState), parsed.version);
      if (!receipt.operations.length) return Promise.resolve();
      try { localStorage.setItem(localReceiptKey(receipt.id), JSON.stringify(receipt)); }
      catch (error) { reportNativeError(key, error, 'receipt'); throw error; }
      reportNativePending(key);
      earlyState = clone(mergedState);
      let task: Promise<void>;
      if (!ready) {
        ready = loadSnapshot(key).then(snapshot => {
          before = clone(snapshot);
        }).then(() => enqueueCommittedReceipt(receipt)).then(() => undefined);
      } else {
        ready = ready.then(() => enqueueCommittedReceipt(receipt)).then(() => undefined);
      }
      task = ready.catch(error => { reportNativeError(key, error, 'persist'); throw error; });
      ready = task;
      return task;
    },
    removeItem: async () => {
      await clearNativeStore(key);
    },
  };
}

function enqueueCommittedReceipt(receipt: NativeReceipt): Promise<void> {
  const previous = queues.get(receipt.key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const outcome = await applyReceipt(receipt);
    if (outcome === 'stale') throw new Error('This tab was opened before data was restored. Reload before editing again.');
  });
  queues.set(receipt.key, next);
  // Zustand does not await asynchronous storage writes. Keep the rejection
  // observed, retain the receipt, and let explicit flush/ack callers retry it.
  next.catch(error => reportNativeError(receipt.key, error, 'commit'));
  return next;
}

function optimisticRevisions(_key: NativeStateKey, revisions: Record<string, number>, operations: NativeDeltaOperation[]) {
  const next = { ...revisions };
  for (const op of operations) {
    const idKey = op.id === undefined ? stateKey(op.field) : `${op.field}:${op.id}`;
    next[idKey] = (next[idKey] ?? 0) + 1;
  }
  return next;
}

export async function readNativeStore(key: NativeStateKey): Promise<JsonObject | null> {
  const snapshot = await loadSnapshot(key);
  return Object.keys(snapshot.state).length || snapshot.revision ? clone(snapshot.state) : null;
}

export function readNativeStoreCached<T extends JsonObject = JsonObject>(key: NativeStateKey): T | null {
  const snapshot = snapshots.get(key);
  return snapshot ? clone(snapshot.state) as T : null;
}

export async function readNativeSnapshot(key: NativeStateKey): Promise<NativeSnapshot> {
  return clone(await loadSnapshot(key));
}

export async function updateNativeStore<T extends JsonObject>(
  key: NativeStateKey,
  updater: (state: T) => T,
  version?: number,
): Promise<T> {
  const base = await readNativeSnapshot(key);
  const next = updater(clone(base.state) as T);
  if (!next || typeof next !== 'object') throw new Error(`Invalid native state update for ${key}.`);
  const targetVersion = version ?? base.version;
  const receipt = makeReceipt(key, base, next, targetVersion);
  if (receipt.operations.length || targetVersion > base.version) await persistReceipt(receipt);
  await flushNativeStore(key);
  return clone(next);
}

/** Persist a patch derived from a previously read authoritative snapshot.
 * The receipt is written synchronously before this returns; its asynchronous
 * promise resolves only after the merged IDB transaction commits. */
export function writeNativeSnapshotDelta(
  key: NativeStateKey,
  base: NativeSnapshot,
  nextState: JsonObject,
  version = base.version,
): Promise<void> {
  const receipt = makeReceipt(key,
    { ...clone(base), state: withoutTabContext(key, base.state) },
    withoutTabContext(key, nextState), version);
  return receipt.operations.length || version > base.version ? persistReceipt(receipt) : Promise.resolve();
}

export async function flushNativeStore(key: NativeStateKey): Promise<void> {
  const queue = queues.get(key);
  if (queue) await queue.catch(() => {});
  for (const receipt of readPendingReceipts(key)) {
    const next = enqueueCommittedReceipt(receipt);
    await next;
  }
  const remaining = queues.get(key);
  if (remaining) await remaining;
}

export async function flushAllNativeStores(): Promise<void> {
  for (const key of NATIVE_STATE_KEYS) await flushNativeStore(key);
}

export async function retryNativeProjection(key: NativeStateKey): Promise<void> {
  const snapshot = await readNativeSnapshot(key);
  if (!await projectSnapshot(snapshot)) {
    throw errors.get(key) ?? new Error('The native data is saved, but the workspace projection is still unavailable.');
  }
  snapshots.set(key, snapshot);
  adoptCommittedSnapshot(key, snapshot);
  errors.delete(key);
  errorPhases.delete(key);
  reportNativeSaved(key);
}

/** Flush only native stores that have in-memory work or durable local receipts. */
export async function flushPendingNativeWrites(): Promise<void> {
  for (const key of NATIVE_STATE_KEYS) {
    if (queues.has(key) || hasPendingNativeReceipts(key)) await flushNativeStore(key);
  }
}

export async function replaceNativeStores(
  states: Partial<Record<NativeStateKey, { state: JsonObject; version?: number } | null>>,
): Promise<number> {
  const db = await openNativeDb();
  const replaced = await new Promise<number>((resolve, reject) => {
    let generation = 1;
    const projectionFloor = Math.max(...NATIVE_STATE_KEYS.map(key => projectedEpoch(key).generation));
    const tx = db.transaction([STATES, META, APPLIED, RECEIPTS], 'readwrite');
    const stores = tx.objectStore(STATES);
    const meta = tx.objectStore(META);
    const metaReq = meta.get('generation');
    const allMetaReq = meta.getAll();
    let ready = 0;
    const replaceWhenReady = () => {
      if (++ready < 2) return;
      const storedFloor = Math.max(0, ...(allMetaReq.result ?? []).map((entry: NativeMeta) => entry.value));
      generation = Math.max(metaReq.result?.value ?? 0, storedFloor, projectionFloor) + 1;
      meta.put({ key: 'generation', value: generation } satisfies NativeMeta);
      for (const key of NATIVE_STATE_KEYS) {
        if (!(key in states)) continue;
        meta.put({ key: `generation:${key}`, value: generation } satisfies NativeMeta);
        const entry = states[key];
        if (entry === null) {
          stores.delete(key);
          continue;
        }
        if (!entry) continue;
        const row: NativeStateRow = { key, state: clone(entry.state), version: entry.version ?? 0,
          revision: 1, recordRevisions: initialRecordRevisions(key, entry.state) };
        stores.put(row);
      }
      tx.objectStore(APPLIED).clear();
      tx.objectStore(RECEIPTS).clear();
    };
    metaReq.onsuccess = allMetaReq.onsuccess = replaceWhenReady;
    metaReq.onerror = allMetaReq.onerror = () => tx.abort();
    tx.oncomplete = () => resolve(generation);
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Could not replace native state.'));
  });
  queues.clear();
  errors.clear();
  errorPhases.clear();
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const storageKey = localStorage.key(i) ?? '';
    if (storageKey.startsWith(NATIVE_PENDING_PREFIX)) {
      try { localStorage.removeItem(storageKey); }
      catch (error) { reportNativeError('ink-notes-storage', error, 'receipt-cleanup'); }
    }
  }
  for (const key of NATIVE_STATE_KEYS) {
    if (!(key in states)) continue;
    const entry = states[key];
    if (entry) {
      const snapshot: NativeSnapshot = { key, state: clone(entry.state), version: entry.version ?? 0,
        revision: 1, generation: replaced, keyGeneration: replaced, recordRevisions: initialRecordRevisions(key, entry.state) };
      snapshots.set(key, snapshot);
      const projected = await projectSnapshot(snapshot);
      if (!hasPendingNativeReceipts(key)) adoptCommittedSnapshot(key, snapshot);
      else reportNativePending(key);
      if (projected) {
        errors.delete(key);
        errorPhases.delete(key);
      }
    } else {
      try { localStorage.removeItem(key); } catch (error) { reportNativeError(key, error, 'projection-reset'); }
      snapshots.delete(key);
      adoptCommittedSnapshot(key, { key, state: {}, version: 0, revision: 0,
        generation: replaced, keyGeneration: replaced, recordRevisions: {} });
    }
  }
  try { window.dispatchEvent(new CustomEvent('iterra:native-state-restored', { detail: { generation: replaced } })); } catch { /* best effort */ }
  return replaced;
}

async function clearNativeStore(key: NativeStateKey): Promise<void> {
  const db = await openNativeDb();
  let generation = 1;
  let keyGeneration = 1;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STATES, META], 'readwrite');
    const states = tx.objectStore(STATES);
    const meta = tx.objectStore(META);
    const generationRequest = meta.get(`generation:${key}`);
    const globalGenerationRequest = meta.get('generation');
    let ready = 0;
    const clearWhenReady = () => {
      if (++ready < 2) return;
      keyGeneration = (generationRequest.result?.value ?? 1) + 1;
      generation = globalGenerationRequest.result?.value ?? 1;
      meta.put({ key: `generation:${key}`, value: keyGeneration } satisfies NativeMeta);
      states.delete(key);
    };
    generationRequest.onsuccess = clearWhenReady;
    globalGenerationRequest.onsuccess = clearWhenReady;
    generationRequest.onerror = globalGenerationRequest.onerror = () => tx.abort();
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error(`Could not clear native store ${key}.`));
  });
  snapshots.delete(key);
  queues.delete(key);
  errors.delete(key);
  errorPhases.delete(key);
  try { localStorage.removeItem(key); } catch (error) { reportNativeError(key, error, 'projection-reset'); }
  adoptCommittedSnapshot(key, { key, state: {}, version: 0, revision: 0,
    generation, keyGeneration, recordRevisions: {} });
  try { window.dispatchEvent(new CustomEvent('iterra:native-state-restored', { detail: { key } })); } catch { /* best effort */ }
}

function initialRecordRevisions(key: NativeStateKey, state: JsonObject) {
  const revisions: Record<string, number> = {};
  for (const operation of diffNativeState(key, {}, state)) {
    const idKey = operation.id === undefined ? stateKey(operation.field) : `${operation.field}:${operation.id}`;
    revisions[idKey] = 1;
  }
  return revisions;
}

export async function resetNativeStateGeneration(): Promise<number> {
  const current: Partial<Record<NativeStateKey, { state: JsonObject; version: number } | null>> = {};
  for (const key of NATIVE_STATE_KEYS) {
    const state = await readNativeStore(key);
    current[key] = state ? { state, version: (await readNativeSnapshot(key)).version } : null;
  }
  return replaceNativeStores(current);
}

/** Fence every already-open native tab before a workspace-wide reset. */
export async function clearNativeStoresAndFence(): Promise<number> {
  return replaceNativeStores({
    'ink-notes-storage': null,
    'syllabus.folio.v1': null,
  });
}

export async function nativePersistenceTestReset() {
  const pendingDb = dbPromise;
  dbPromise = null;
  if (pendingDb) {
    try { (await pendingDb).close(); } catch { /* opening may have failed */ }
  }
  snapshots.clear();
  baselineListeners.clear();
  hydration.clear();
  queues.clear();
  errors.clear();
  errorPhases.clear();
  receiptSequence = 0;
}
