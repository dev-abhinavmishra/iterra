import { useEffect, useRef, useState } from 'react';
import type { StoreEntity } from './hub';
import { boxedFocusUrl, parseBoxedFocus } from './integration/boxedFocus';

/* Non-intrusive toast notifications for completed focus sessions and
   resolved cross-module intakes. Live focus controls now live directly in
   the global workspace header so they never occlude bottom module docks. */

interface Toast {
  id: number;
  text: string;
  url?: string;
  ms: number;
}

const SESSION_TOAST_MAX_AGE_MS = 5 * 60 * 1000;
const SESSION_TOAST_FUTURE_SKEW_MS = 30 * 1000;

function isRecentNonDemoSession(entity: StoreEntity, now: number): boolean {
  if (entity.type !== 'session' || entity.data?.demo === true || entity.id.startsWith('demo-')) return false;
  const timestamp = typeof entity.createdAt === 'number'
    ? entity.createdAt
    : typeof entity.data?.endedAt === 'number'
      ? entity.data.endedAt
      : NaN;
  if (!Number.isFinite(timestamp)) return false;
  const age = now - timestamp;
  return age >= -SESSION_TOAST_FUTURE_SKEW_MS && age <= SESSION_TOAST_MAX_AGE_MS;
}

function sessionToastFromEvent(payload: Record<string, unknown>): { id: string; text: string; url?: string } | null {
  const id = typeof payload.sessionId === 'string' ? payload.sessionId : '';
  if (!id || id.startsWith('demo-')) return null;
  const rawText = typeof payload.text === 'string' ? payload.text.trim() : '';
  const label = rawText
    .replace(/^focus\s+·\s+\d+m\s+—\s*/i, '')
    .replace(/^session\s+(?:completed|partial):\s*/i, '')
    .replace(/\s+\(\d+m\)\s*$/i, '')
    .trim();
  const minutes = Number(payload.minutes ?? payload.elapsedMinutes);
  return {
    id,
    text: `${label || 'Focus session'}${Number.isFinite(minutes) && minutes > 0 ? ` · ${Math.round(minutes)}m` : ''} logged`,
    url: typeof payload.url === 'string' ? payload.url : undefined,
  };
}

function rememberSessionNotice(seen: Set<string>, id: string): void {
  seen.add(id);
  if (seen.size > 100) seen.delete(seen.values().next().value!);
}

export function Ambient({
  entities,
  entityState,
  onGo,
  panelOpen,
  activePlace,
}: {
  entities: StoreEntity[];
  entityState: 'loading' | 'ready' | 'error';
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
  const notifiedSessionIds = useRef(new Set<string>());

  useEffect(() => {
    const keys = new Set(entities.filter((e) => e.type === 'session').map((e) => e.key));
    if (entityState !== 'ready') {
      /* Do not treat the initial store hydration (or a retry) as fresh work.
         The first ready snapshot becomes the baseline; live inserts after it
         still surface through the ordinary diff below. */
      seenSessions.current = null;
      return;
    }
    if (seenSessions.current === null) {
      seenSessions.current = keys;
      return;
    }
    const now = Date.now();
    const fresh = entities.find((e) =>
      e.type === 'session' && !seenSessions.current!.has(e.key) && isRecentNonDemoSession(e, now),
    );
    seenSessions.current = keys;
    if (fresh) {
      if (notifiedSessionIds.current.has(fresh.id)) return;
      rememberSessionNotice(notifiedSessionIds.current, fresh.id);
      const mins = (fresh.data?.minutes as number) || null;
      const boxed = parseBoxedFocus(fresh.data?.boxedFocus);
      pushRef.current({
        text: `${fresh.title || 'Focus session'}${mins ? ` · ${mins}m` : ''} logged`,
        url: boxed ? boxedFocusUrl(boxed) : fresh.url || '/apps/timer/',
      });
    }
  }, [entities, entityState]);

  useEffect(() => {
    const it = (window as any).iterra;
    if (!it?.events?.on) return;
    const offIntake = it.events.on('intake.resolved', (rec: any) => {
      const p = rec?.payload || {};
      if (typeof p.toast !== 'string') return;
      pushRef.current({ text: p.toast, url: typeof p.url === 'string' ? p.url : undefined, ms: 6000 });
    });
    const offSession = it.events.on('session.completed', (rec: any) => {
      const notice = sessionToastFromEvent(rec?.payload || {});
      if (!notice || notifiedSessionIds.current.has(notice.id)) return;
      rememberSessionNotice(notifiedSessionIds.current, notice.id);
      pushRef.current({ text: notice.text, url: notice.url });
    });
    return () => {
      offIntake?.();
      offSession?.();
    };
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
      } ${activePlace === 'boxed' ? 'max-[761px]:bottom-[calc(4.5rem+var(--iterra-bottom-inset,0px))]' : ''}`}
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
