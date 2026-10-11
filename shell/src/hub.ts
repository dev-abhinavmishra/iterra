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
