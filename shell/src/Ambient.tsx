import { useEffect, useRef, useState } from 'react';
import type { StoreEntity } from './hub';

/* Non-intrusive toast notifications for completed focus sessions and
   resolved cross-module intakes. Live focus controls now live directly in
   the global workspace header so they never occlude bottom module docks. */

interface Toast {
  id: number;
  text: string;
  url?: string;
  ms: number;
}

export function Ambient({
  entities,
  onGo,
  panelOpen,
}: {
  entities: StoreEntity[];
  mounted?: string[];
  activePlace?: string | null;
  onEnter?: (id: string) => void;
  onGo: (url: string) => void;
  /* details panel is a 320px rail at lg+ — slide the toast clear of it */
  panelOpen?: boolean;
}) {
  /* a short queue, not a single slot — a quota warning landing while a
     session-logged toast is up must not vaporize it. Cap 3: a burst
     shows the newest three rather than stacking forever. */
  const [queue, setQueue] = useState<Toast[]>([]);
  const counter = useRef(0);
  const push = (t: Omit<Toast, 'id' | 'ms'> & { ms?: number }) => {
    setQueue((q) => {
      /* same text back-to-back is noise (quota warnings can repeat) —
         collapse to one line */
      if (q.some((x) => x.text === t.text)) return q;
      return [...q, { ...t, ms: t.ms ?? 6500, id: ++counter.current }].slice(-3);
    });
  };
  const pushRef = useRef(push);
  pushRef.current = push;

  /* the head toast lives for its ms, then makes way for the next */
  const head = queue[0];
  useEffect(() => {
    if (!head) return;
    const t = window.setTimeout(() => setQueue((q) => q.slice(1)), head.ms);
    return () => window.clearTimeout(t);
  }, [head]);

  const seenSessions = useRef<Set<string> | null>(null);

  useEffect(() => {
    const keys = new Set(entities.filter((e) => e.type === 'session').map((e) => e.key));
    if (seenSessions.current === null) {
      seenSessions.current = keys;
      return;
    }
    const fresh = entities.find((e) => e.type === 'session' && !seenSessions.current!.has(e.key));
    seenSessions.current = keys;
    if (fresh) {
      const mins = (fresh.data?.minutes as number) || null;
      pushRef.current({
        text: `${fresh.title || 'Focus session'}${mins ? ` · ${mins}m` : ''} logged`,
        url: fresh.url || '/apps/timer/',
      });
    }
  }, [entities]);

  useEffect(() => {
    const it = (window as any).iterra;
    if (!it?.events?.on) return;
    const off = it.events.on('intake.resolved', (rec: any) => {
      const p = rec?.payload || {};
      if (typeof p.toast !== 'string') return;
      pushRef.current({ text: p.toast, url: typeof p.url === 'string' ? p.url : undefined, ms: 6000 });
    });
    return off;
  }, []);

  /* deployed while this tab is open — the new SW is installed and about to
     take control; offer the refresh instead of quietly stranding the tab.
     Its own lane — a never-expiring toast at the queue's head would starve
     every notice behind it. */
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => {
    const onUpdate = () => setUpdateReady(true);
    window.addEventListener('iterra:update-available', onUpdate);
    return () => window.removeEventListener('iterra:update-available', onUpdate);
  }, []);

  /* a guarded persist write hit the quota — surface it in chrome so the
     warning reaches the user even while the failing app is hidden */
  useEffect(() => {
    const onFull = () => pushRef.current({ text: 'Storage is full — export a backup, then clear room', url: '#/settings', ms: 8000 });
    window.addEventListener('iterra:storage-full', onFull);
    return () => window.removeEventListener('iterra:storage-full', onFull);
  }, []);

  /* generic notice channel — any module can surface a toast through the
     shell without owning a toast stack of its own:
     dispatchEvent(new CustomEvent('iterra:toast', {detail:{text, url}})) */
  useEffect(() => {
    const onToast = (e: Event) => {
      const d = (e as CustomEvent).detail as { text?: string; url?: string } | undefined;
      if (!d?.text) return;
      pushRef.current({ text: d.text, url: typeof d.url === 'string' ? d.url : undefined, ms: 7000 });
    };
    window.addEventListener('iterra:toast', onToast);
    return () => window.removeEventListener('iterra:toast', onToast);
  }, []);

  if (!head && !updateReady) return null;

  return (
    <div
      role="status"
      className={`it-ambient pointer-events-none fixed bottom-[calc(1rem+var(--iterra-bottom-inset,0px))] z-50 flex flex-col items-end gap-2 transition-[right] duration-150 ${
        panelOpen ? 'right-4 lg:right-[336px]' : 'right-4'
      }`}
    >
      {updateReady && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="anim-rise pointer-events-auto flex items-center gap-2.5 rounded-[6px] border border-[var(--color-accent)] bg-[var(--color-accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--color-accent-fg)] shadow-lg cursor-pointer"
        >
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-accent-fg)]" />
          <span>A new version of Iterra is ready</span>
          <span className="text-[11px] underline underline-offset-2">Refresh</span>
        </button>
      )}
      {head && (
        <button
          type="button"
          onClick={() => {
            if (head.url) onGo(head.url);
            setQueue((q) => q.slice(1));
          }}
          className="anim-rise pointer-events-auto flex items-center gap-2.5 rounded-[6px] border border-[var(--color-accent)] bg-[var(--color-sheet)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--color-ink)] shadow-lg cursor-pointer"
        >
          <span className="live-dot inline-block h-2 w-2 rounded-full bg-[var(--color-accent)]" />
          <span>{head.text}</span>
          {queue.length > 1 && <span className="text-[11px] text-[var(--color-mute)]">+{queue.length - 1}</span>}
          {head.url && <span className="text-[11px] font-semibold text-[var(--color-accent)]">Open →</span>}
        </button>
      )}
    </div>
  );
}
