import { useEffect, useMemo, useRef, useState } from 'react';
import { PLACE_MAP } from './places';
import { readShared, sendTo, type SharedField, type StoreEntity } from './hub';

/* the ambient rail — a floating dock that keeps LIVE environment state
   visible no matter which place (or dossier, or the terrain itself) is
   up: the running session with real controls, what's due, what's next,
   which frames are warm. Everything on it is a verb. */

interface FocusState {
  running?: boolean;
  paused?: boolean;
  label?: string;
  course?: string;
  blockId?: string | null;
  endsAt?: number;
  remainingSec?: number;
  totalMin?: number;
}

const chip =
  'flex items-center gap-1.5 rounded-full border border-atlas-300 bg-atlas-50/95 px-3 py-1.5 text-[12px] text-field-faint shadow-[0_10px_30px_-12px_rgba(29,51,42,0.35)] backdrop-blur-sm hover:border-moss-400 hover:text-moss-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-moss-500';
const ctl =
  'rounded-full px-1.5 py-0.5 text-[11px] leading-none text-moss-700 hover:bg-moss-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-moss-500';

function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function useNow(period = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), period);
    return () => window.clearInterval(t);
  }, [period]);
  return now;
}

export function Ambient({
  entities,
  mounted,
  activePlace,
  onEnter,
  onGo,
}: {
  entities: StoreEntity[];
  mounted: string[];
  activePlace: string | null;
  onEnter: (id: string) => void;
  onGo: (url: string) => void;
}) {
  const now = useNow(1000);
  const [shared, setShared] = useState<Record<string, SharedField>>(readShared);
  useEffect(() => {
    const emit = () => setShared(readShared());
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'iterra.v1.doc.shared') emit();
    };
    window.addEventListener('storage', onStorage);
    const t = window.setInterval(emit, 3000);
    emit();
    return () => {
      window.removeEventListener('storage', onStorage);
      window.clearInterval(t);
    };
  }, []);

  /* ── live focus session ── */
  const f = (shared.focus?.v as FocusState | null) ?? null;
  const focusAt = shared.focus?.at || 0;
  const focusFresh = !!f && now - focusAt < 15 * 60 * 1000;
  const focusLive = focusFresh && (f!.running === true || f!.paused === true);
  const secLeft = f?.running && f.endsAt ? Math.max(0, (f.endsAt - now) / 1000) : f?.remainingSec ?? 0;
  const stale = focusFresh && f!.running && f!.endsAt ? f!.endsAt - now < -5 * 60 * 1000 : false;
  const courseCode = f?.course && !f.course.includes(':') ? f.course : null;

  /* ── store-derived chips ── */
  const dueCards = useMemo(
    () =>
      entities.filter(
        (e) =>
          e.type === 'card' &&
          typeof (e.data?.dueAt as number) === 'number' &&
          (e.data!.dueAt as number) <= Date.now(),
      ),
    [entities],
  );
  const nextCommit = useMemo(
    () =>
      entities
        .filter((e) => e.type === 'commitment' && e.data && e.data.status !== 'done' && e.data.status !== 'completed')
        .sort((a, b) => ((a.data?.dueAt as number) || Infinity) - ((b.data?.dueAt as number) || Infinity))[0],
    [entities],
  );
  const reg = shared.register?.v as { marked?: number; total?: number; pending?: number } | undefined;
  /* noteActive claims 'the page open on the desk' — present tense, so the
     same 5-min window the sibling readers (useOtherNoteActive) apply.
     Live desks re-stamp `at` (margin every 3s publish, ink's 2-min beat);
     a dead desk's stamp ages out instead of lingering forever. */
  const noteFresh = now - (shared.noteActive?.at || 0) < 5 * 60 * 1000;
  const note = (noteFresh ? shared.noteActive?.v : undefined) as { title?: string; url?: string } | undefined;

  /* ── session-end toast: a new session entity lands → celebrate it ── */
  const [toast, setToast] = useState<{ text: string; url?: string } | null>(null);
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
        text: `${fresh.title || 'session'}${mins ? ` · ${mins}m` : ''} — logged`,
        url: fresh.url || '/apps/timer/',
      });
      const t = window.setTimeout(() => setToast(null), 7000);
      return () => window.clearTimeout(t);
    }
  }, [entities]);

  /* ── intake.resolved: an app drained a queued send and reported a
       {toast} line — surface it wherever the terrain is looking ── */
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

  /* ── quick-start menu ── */
  const [qsOpen, setQsOpen] = useState(false);
  const topCourses = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entities) {
      const c = e.course || e.data?.code;
      if (c && typeof c === 'string') m.set(c, (m.get(c) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c]) => c);
  }, [entities]);
  const quickStart = (course?: string) => {
    setQsOpen(false);
    void sendTo({
      to: 'timer',
      action: 'timer.start',
      payload: { label: course ? `${course} focus` : 'focus session', minutes: 25, course, from: 'terrain' },
    }).then((r) => {
      if (r.url) onGo(r.url);
    });
  };

  const timerCtl = (op: 'pause' | 'resume' | 'finish') => {
    void sendTo({ to: 'timer', action: 'timer.control', payload: { op } });
  };

  const show = focusLive || dueCards.length > 0 || nextCommit || (reg?.pending ?? 0) > 0 || note || toast || mounted.length > 1;
  if (!show) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-40 flex flex-col items-center gap-1.5 px-3">
      {toast && (
        <button
          onClick={() => (toast.url ? onGo(toast.url) : setToast(null))}
          className="anim-rise pointer-events-auto flex items-center gap-2 rounded-full border border-moss-400 bg-moss-50/95 px-4 py-1.5 text-[12.5px] font-medium text-moss-700 shadow-[0_10px_30px_-10px_rgba(29,51,42,0.4)] backdrop-blur-sm"
        >
          <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-moss-600" />
          {toast.text}
          <span className="text-[10px] opacity-60">open →</span>
        </button>
      )}
      <div className="pointer-events-auto flex max-w-full items-center gap-1.5 overflow-x-auto">
        {/* the running (or paused) session — seconds-accurate countdown from
            endsAt; controls steer the real countdown inside the frame */}
        {focusLive && !stale && activePlace !== 'timer' && (
          <div className={`${chip} ${f!.endsAt && f!.endsAt! - now < 60000 && f!.running ? 'border-moss-500' : ''}`}>
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${f!.paused ? 'bg-atlas-400' : 'bg-moss-600 live-dot'}`} />
            <button onClick={() => onEnter('timer')} className="flex items-baseline gap-1.5" title="open the instruments">
              <span className="max-w-36 truncate font-medium text-field-ink">{f!.label || 'Focus'}</span>
              <span className="font-mono text-[11.5px] tabular-nums text-moss-700">
                {/* the split-flap in miniature — each second the digits
                    drop into place like a flap card (anim-tick, keyed) */}
                {f!.paused
                  ? `paused ${fmtClock(secLeft)}`
                  : <span key={Math.floor(secLeft)} className="anim-tick">{fmtClock(secLeft)}</span>}
              </span>
              {typeof f!.totalMin === 'number' && (
                <span className="hidden text-[10px] text-atlas-400 sm:inline">
                  {f!.totalMin * 60 - secLeft >= 60
                    ? `${Math.floor((f!.totalMin * 60 - secLeft) / 60)}m in · `
                    : ''}/ {f!.totalMin}m
                </span>
              )}
            </button>
            {courseCode && (
              <button
                onClick={() => onGo(`#/c/${encodeURIComponent(courseCode)}`)}
                className="rounded-full bg-moss-100 px-1.5 py-0.5 text-[10px] font-semibold text-moss-700 hover:bg-moss-200"
                title={`${courseCode} dossier`}
              >
                {courseCode}
              </button>
            )}
            {f!.running ? (
              <button onClick={() => timerCtl('pause')} className={ctl} title="pause the session">
                ❚❚
              </button>
            ) : (
              <button onClick={() => timerCtl('resume')} className={ctl} title="resume">
                ▶
              </button>
            )}
            <button onClick={() => timerCtl('finish')} className={ctl} title="finish early (logs it)">
              ✓
            </button>
          </div>
        )}

        {stale && activePlace !== 'timer' && (
          <button onClick={() => onEnter('timer')} className={`${chip} opacity-60`} title="session may have ended — check the instruments">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-atlas-400" />
            <span className="max-w-32 truncate">{f!.label || 'Focus'}</span>
            <span className="text-[10.5px]">went quiet</span>
          </button>
        )}

        {dueCards.length > 0 && activePlace !== 'flashcards' && (
          <button
            onClick={() => onEnter('flashcards')}
            className={chip}
            title={`${dueCards.length} card${dueCards.length === 1 ? '' : 's'} due across ${new Set(dueCards.map((c) => c.data?.deckId || c.app)).size} deck(s)`}
          >
            <span className="text-moss-700">{dueCards.length} due</span>
            <span className="text-[10.5px]">review →</span>
          </button>
        )}

        {nextCommit && activePlace !== 'syllabus' && (
          <button
            onClick={() => onGo(nextCommit.url || '#/p/syllabus')}
            className={chip}
            title="next commitment"
          >
            <span className="text-[10.5px] uppercase tracking-wide">next</span>
            <span className="max-w-40 truncate">{nextCommit.title}</span>
          </button>
        )}

        {(reg?.pending ?? 0) > 0 && activePlace !== 'rhythm' && (
          <button onClick={() => onEnter('rhythm')} className={chip} title="marks left on today's register">
            <span className="text-moss-700">
              {reg!.marked ?? 0}/{reg!.total ?? 0}
            </span>
            <span className="text-[10.5px]">marks</span>
          </button>
        )}

        {note?.title && activePlace !== 'ink' && (
          <button onClick={() => onGo(note.url || '#/p/ink')} className={chip} title="the page open on the desk">
            <span className="text-[10.5px]">✎</span>
            <span className="max-w-32 truncate">{note.title}</span>
          </button>
        )}

        {/* warm frames — quiet presence dots; hover names the place */}
        {mounted.filter((id) => id !== activePlace).length > 0 && (
          <div className={`${chip} gap-1 px-2`} title="warm places">
            {mounted
              .filter((id) => id !== activePlace)
              .slice(0, 8)
              .map((id) => (
                <button
                  key={id}
                  onClick={() => onEnter(id)}
                  title={PLACE_MAP[id]?.app || id}
                  className="rounded-full p-0.5 hover:bg-moss-100"
                >
                  <span className="block h-3.5 w-3.5 text-moss-700 [&>svg]:h-full [&>svg]:w-full">
                    {PLACE_MAP[id]?.glyph}
                  </span>
                </button>
              ))}
          </div>
        )}

        <div className="relative">
          <button onClick={() => setQsOpen((v) => !v)} className={chip} title="start a session">
            <span className="text-moss-700">+</span>
            <span className="text-[10.5px]">focus</span>
          </button>
          {qsOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setQsOpen(false)} />
              <div className="anim-pop absolute bottom-full right-0 z-40 mb-1 w-48 rounded-lg border border-atlas-300 bg-atlas-50 p-1.5 shadow-[0_16px_40px_-16px_rgba(29,51,42,0.4)]" style={{ transformOrigin: 'bottom right' }}>
                <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-atlas-500">
                  start a session for
                </div>
                <button
                  onClick={() => quickStart()}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] text-field-ink hover:bg-moss-100"
                >
                  just focus
                </button>
                {topCourses.map((c) => (
                  <button
                    key={c}
                    onClick={() => quickStart(c)}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] text-field-ink hover:bg-moss-100"
                  >
                    <span className="min-w-0 flex-1 truncate">{c}</span>
                    <span className="text-[10px] text-atlas-400">25m</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
