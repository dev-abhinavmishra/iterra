/* Typed client for the hub store the app bridges publish into
   (window.iterra is loaded globally via /iterra-hub.js). */

declare global {
  interface Window {
    iterra?: {
      apps(): Record<string, Presence>;
      open(url: string): void;
      doc(ns: string): { get(): unknown; set(v: unknown): void; subscribe(cb: (v: unknown) => void): () => void };
      isFramed(): boolean;
    };
  }
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
