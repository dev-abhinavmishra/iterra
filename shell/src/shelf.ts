/* the shelf — terrain-level pins. Any entity (a problem, a deck, a note, a
   block) pinned from a dossier or palette lands on the home rail, one click
   back into its place. Shell-owned chrome state, not a mesh doc. */

export interface ShelfPin {
  app: string;
  t?: string;
  id?: string;
  title: string;
  url: string;
  at: number;
}

const KEY = 'iterra.v1.shelf';
const CAP = 24;

export function readShelf(): ShelfPin[] {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!Array.isArray(d?.pins)) return [];
    /* a hand-edited or version-stale pin missing url/title renders as
       garbage or navigates nowhere — drop malformed entries at read */
    return d.pins.filter(
      (p: unknown): p is ShelfPin =>
        !!p && typeof p === 'object' &&
        typeof (p as ShelfPin).url === 'string' && (p as ShelfPin).url.length > 0 &&
        typeof (p as ShelfPin).title === 'string' &&
        typeof (p as ShelfPin).app === 'string',
    );
  } catch {
    return [];
  }
}

export function isPinned(url: string): boolean {
  return readShelf().some((p) => p.url === url);
}

export function togglePin(pin: Omit<ShelfPin, 'at'>): ShelfPin[] {
  const cur = readShelf();
  const next = cur.some((p) => p.url === pin.url)
    ? cur.filter((p) => p.url !== pin.url)
    : [{ ...pin, at: Date.now() }, ...cur].slice(0, CAP);
  try {
    localStorage.setItem(KEY, JSON.stringify({ pins: next }));
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
  } catch { /* full or blocked — shelf stays best-effort */ }
  return next;
}

export function subscribeShelf(cb: (pins: ShelfPin[]) => void): () => void {
  const emit = () => cb(readShelf());
  const h = (ev: StorageEvent) => { if (ev.key === KEY) emit(); };
  window.addEventListener('storage', h);
  emit();
  return () => window.removeEventListener('storage', h);
}
