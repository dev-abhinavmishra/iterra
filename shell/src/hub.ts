/* Typed client for the hub store the app bridges publish into
   (window.iterra is loaded globally via /iterra-hub.js). */

declare global {
  interface Window {
    iterra?: {
      apps(): Record<string, Presence>;
      open(url: string): void;
      doc(ns: string): { get(): unknown; set(v: unknown): void; subscribe(cb: (v: unknown) => void): () => void };
      isFramed(): boolean;
      store?: {
        put(e: Record<string, unknown>): Promise<{ ok: boolean; entity?: StoreEntity; error?: string }>;
        get(key: string): Promise<StoreEntity | null>;
        list(q?: { app?: string; type?: string; courseId?: string }): Promise<StoreEntity[]>;
        search(text: string): Promise<StoreEntity[]>;
        remove(key: string): Promise<{ ok: boolean }>;
        subscribe(cb: (kind: string, data: unknown) => void): () => void;
      };
      courses?: {
        list(): Promise<StoreEntity[]>;
        byCode(code: string): Promise<StoreEntity | null>;
      };
      send?(opts: SendOpts): Promise<SendResult>;
      events?: {
        emit(type: string, payload?: Record<string, unknown>): Promise<{ ok: boolean }>;
        list(q?: { type?: string; app?: string; limit?: number }): Promise<StoreEvent[]>;
        on(match: string | string[], cb: (rec: StoreEvent) => void): () => void;
      };
    };
  }
}

/* ── canonical store client (the hub's shared layer — WIRING §8/ADAPTER) ── */

export interface StoreEntity {
  key: string;
  app: string;
  type: string;
  id: string;
  courseId?: string;
  course?: string;
  topic?: string;
  title?: string;
  sub?: string;
  url?: string;
  lang?: string;
  data?: Record<string, unknown>;
  createdAt?: number;
  updatedAt?: number;
  v?: number;
}

export interface StoreEvent {
  seq?: number;
  type: string;
  app: string;
  payload?: Record<string, unknown>;
  at: number;
}

export interface SendOpts {
  to: string;
  action: string;
  entity?: Partial<StoreEntity>;
  payload?: Record<string, unknown>;
}

export interface SendResult {
  ok: boolean;
  id?: string;
  delivered?: 'direct' | 'queued';
  url?: string | null;
  error?: string;
}

/** every entity in the canonical store, newest-updated first. No cap —
    this is the truth, not the published index mirror. */
export async function storeListAll(): Promise<StoreEntity[]> {
  const it = window.iterra;
  if (!it?.store?.list) return [];
  try {
    return (await it.store.list({})) || [];
  } catch {
    return [];
  }
}

export async function storeSearch(q: string): Promise<StoreEntity[]> {
  const it = window.iterra;
  if (!it?.store?.search || !q.trim()) return [];
  try {
    return (await it.store.search(q.trim())) || [];
  } catch {
    return [];
  }
}

export async function storeList(q: { app?: string; type?: string; courseId?: string }): Promise<StoreEntity[]> {
  const it = window.iterra;
  if (!it?.store?.list) return [];
  try {
    return (await it.store.list(q)) || [];
  } catch {
    return [];
  }
}

export async function storeCourses(): Promise<StoreEntity[]> {
  const it = window.iterra;
  if (!it?.courses?.list) return [];
  try {
    return (await it.courses.list()) || [];
  } catch {
    return [];
  }
}

export async function sendTo(opts: SendOpts): Promise<SendResult> {
  const it = window.iterra;
  if (!it?.send) return { ok: false, error: 'no hub' };
  try {
    return await it.send(opts);
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** wake a keep-alive frame so its adapter refreshes from the store */
/* oldest pending intake id for a place — a cold frame mounts AT
   '?intake=<id>' so its boot-drain lands on the delivered result
   (a bare mount would resolve the send without ever showing it). */
export async function firstPendingIntake(app: string): Promise<string | null> {
  const it = (window as any).iterra;
  if (!it?.intakes?.pending) return null;
  try {
    const rows = await it.intakes.pending(app);
    return rows?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

/* queued sends waiting in each app's intake — the switcher badge shows
   'N waiting' so a queued transfer is visible, not silent. */
export async function pendingIntakes(): Promise<Record<string, number>> {
  const it = (window as any).iterra;
  const out: Record<string, number> = {};
  if (!it?.intakes?.pending) return out;
  for (const p of ['syllabus', 'rhythm', 'flashcards', 'ink', 'margin', 'gradestack', 'timer', 'proof']) {
    try {
      const rows = await it.intakes.pending(p);
      if (rows?.length) out[p] = rows.length;
    } catch { /* count stays absent */ }
  }
  return out;
}

export function wakeFrame(frame: HTMLIFrameElement | null | undefined) {
  try {
    frame?.contentWindow?.postMessage({ type: 'iterra:wake' }, window.location.origin);
  } catch { /* cross-origin or dead frame — nothing to wake */ }
}

/** subscribe to canonical-store changes (entity puts/removes, events,
    links, intake writes). Re-read via storeList / storeSearch — the
    callback payload is just a poke. */
export function subscribeStore(cb: () => void): () => void {
  const it = window.iterra;
  if (it?.store?.subscribe) {
    try {
      return it.store.subscribe(() => cb());
    } catch { /* fall through to polling */ }
  }
  /* no store subscribe (old hub) — poll the shared surface like the
     other subscribers do */
  const t = window.setInterval(cb, 2500);
  return () => window.clearInterval(t);
}

export interface Presence {
  app: string;
  title: string;
  summary: unknown;
  at: number;
  /** true when the entry was published from inside the terrain frame —
      solo copies also publish but may not overwrite a fresh framed entry */
  framed?: boolean;
}

export function readPresences(): Record<string, Presence> {
  try {
    return JSON.parse(localStorage.getItem('iterra.v1.apps') || '{}');
  } catch {
    return {};
  }
}

export function subscribePresences(cb: (p: Record<string, Presence>) => void): () => void {
  const emit = () => cb(readPresences());
  const onStorage = (ev: StorageEvent) => {
    if (ev.key === 'iterra.v1.apps') emit();
  };
  window.addEventListener('storage', onStorage);
  const t = window.setInterval(emit, 2500);
  emit();
  return () => {
    window.removeEventListener('storage', onStorage);
    window.clearInterval(t);
  };
}

/* The commons — apps' namespaced fields on iterra.doc('shared'), each
   stamped { v, by, at } by its writer (docs/WIRING.md §7). */
export interface SharedField<T = any> {
  v: T;
  by: string;
  at: number;
}

export function readShared(): Record<string, SharedField> {
  try {
    const m = JSON.parse(localStorage.getItem('iterra.v1.doc.shared') || '{}');
    return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
  } catch {
    return {};
  }
}

export function subscribeShared(cb: (m: Record<string, SharedField>) => void): () => void {
  const emit = () => cb(readShared());
  const onStorage = (ev: StorageEvent) => {
    if (ev.key === 'iterra.v1.doc.shared') emit();
  };
  window.addEventListener('storage', onStorage);
  const t = window.setInterval(emit, 2500);
  emit();
  return () => {
    window.removeEventListener('storage', onStorage);
    window.clearInterval(t);
  };
}

/* Entity index — apps publish their top-level entities to
   iterra.doc('index.<app>') (docs/WIRING.md §7). The shell turns it into
   the unified palette. */
export interface Entity {
  t?: string;
  id?: string;
  title?: string;
  sub?: string;
  course?: string;
  topic?: string;
  url?: string;
  at?: number;
}

export function readIndexes(): Record<string, Entity[]> {
  const out: Record<string, Entity[]> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i) || '';
    const m = k.match(/^iterra\.v1\.doc\.index\.([a-z]+)$/);
    if (!m) continue;
    try {
      const d = JSON.parse(localStorage.getItem(k) || 'null');
      out[m[1]] = Array.isArray(d?.entities) ? d.entities : [];
    } catch { /* ignore */ }
  }
  return out;
}

export function subscribeIndexes(cb: (m: Record<string, Entity[]>) => void): () => void {
  const emit = () => cb(readIndexes());
  const onStorage = (ev: StorageEvent) => {
    if (/^iterra\.v1\.doc\.index\.[a-z]+$/.test(ev.key || '')) emit();
  };
  window.addEventListener('storage', onStorage);
  const t = window.setInterval(emit, 2500);
  emit();
  return () => {
    window.removeEventListener('storage', onStorage);
    window.clearInterval(t);
  };
}

/* Activity feed — iterra.doc('feed'), newest-first cap 30 (WIRING §7). */
export interface FeedItem {
  app: string;
  text: string;
  url?: string;
  at: number;
  /* optional linkage keys — emitters tag the stir with the course/topic it
     belongs to so dossiers file it without needing the url to resolve */
  course?: string;
  topic?: string;
}

export function readFeed(): FeedItem[] {
  try {
    const d = JSON.parse(localStorage.getItem('iterra.v1.doc.feed') || 'null');
    return Array.isArray(d?.items) ? d.items : [];
  } catch {
    return [];
  }
}

export function subscribeFeed(cb: (items: FeedItem[]) => void): () => void {
  const emit = () => cb(readFeed());
  const onStorage = (ev: StorageEvent) => {
    if (ev.key === 'iterra.v1.doc.feed') emit();
  };
  window.addEventListener('storage', onStorage);
  const t = window.setInterval(emit, 2500);
  emit();
  return () => {
    window.removeEventListener('storage', onStorage);
    window.clearInterval(t);
  };
}
