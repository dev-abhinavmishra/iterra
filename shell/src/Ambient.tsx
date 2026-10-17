import { useEffect, useRef, useState } from 'react';
import type { StoreEntity } from './hub';

/* Non-intrusive toast notifications for completed focus sessions and
   resolved cross-module intakes. Live focus controls now live directly in
   the global workspace header so they never occlude bottom module docks. */

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
  const [toast, setToast] = useState<{ text: string; url?: string; refresh?: boolean } | null>(null);
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
      setToast({
        text: `${fresh.title || 'Focus session'}${mins ? ` · ${mins}m` : ''} logged`,
        url: fresh.url || '/apps/timer/',
      });
      const t = window.setTimeout(() => setToast(null), 6500);
      return () => window.clearTimeout(t);
    }
  }, [entities]);

  useEffect(() => {
    const it = (window as any).iterra;
    if (!it?.events?.on) return;
    const off = it.events.on('intake.resolved', (rec: any) => {
      const p = rec?.payload || {};
      if (typeof p.toast !== 'string') return;
      setToast({ text: p.toast, url: typeof p.url === 'string' ? p.url : undefined });
      const t = window.setTimeout(() => setToast(null), 6000);
      void t;
    });
    return off;
  }, []);

  /* deployed while this tab is open — the new SW is installed and about to
     take control; offer the refresh instead of quietly stranding the tab */
  useEffect(() => {
    const onUpdate = () => setToast({ text: 'A new version of Iterra is ready', refresh: true });
    window.addEventListener('iterra:update-available', onUpdate);
    return () => window.removeEventListener('iterra:update-available', onUpdate);
  }, []);

  if (!toast) return null;

  return (
    <div
      role="status"
      className={`pointer-events-none fixed bottom-[calc(1rem+var(--iterra-bottom-inset,0px))] z-50 flex flex-col items-end gap-2 transition-[right] duration-150 ${
        panelOpen ? 'right-4 lg:right-[336px]' : 'right-4'
      }`}
    >
      <button
        type="button"
        onClick={() => {
          if (toast.refresh) {
            window.location.reload();
            return;
          }
          if (toast.url) onGo(toast.url);
          setToast(null);
        }}
        className="anim-rise pointer-events-auto flex items-center gap-2.5 rounded-[6px] border border-[var(--color-accent)] bg-[var(--color-sheet)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--color-ink)] shadow-lg cursor-pointer"
      >
        <span className="live-dot inline-block h-2 w-2 rounded-full bg-[var(--color-accent)]" />
        <span>{toast.text}</span>
        {toast.refresh && <span className="text-[11px] font-semibold text-[var(--color-accent)]">Refresh</span>}
        {!toast.refresh && toast.url && <span className="text-[11px] font-semibold text-[var(--color-accent)]">Open →</span>}
      </button>
    </div>
  );
}
