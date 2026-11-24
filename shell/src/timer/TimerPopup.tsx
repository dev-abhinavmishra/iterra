import { useEffect, useState } from 'react';
import {
  Timer as TimerIcon,
  Play,
  Pause,
  Check,
  Plus,
  ArrowUpRight,
  X,
} from 'lucide-react';
import { sendTo } from '../hub';
import {
  liveCourse,
  liveLabel,
  livePhase,
  liveRemainingMs,
  liveTotalMs,
  readLiveSession,
  subscribeLiveSession,
  type LiveSession,
} from './liveSession';

/* The passive Timer — a small floating widget that lives above every
   section and inside every place. It reads the live-session blob
   TimerView publishes (src/timer/liveSession.ts → 'timer.session.live.v1'
   + shared.focus) so it never imports the timer bundle, and it renders
   NOTHING while no session is live — the timer stays a quiet place until
   a session actually exists. Control ops ride the existing 'timer.control'
   intake → 'timer.ops.v1' localStorage queue → TimerView's listener, so
   steering works even when the timer place was never mounted this boot
   (ensurePlace mounts it hidden; cold ops queue until it lands). */

function fmtClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function TimerPopup({
  onEnter,
  ensurePlace,
}: {
  onEnter: (placeId: string) => void;
  /* ask the shell to mount a place in the background (keep-alive, hidden)
     so its adapter + views are live for control ops — no navigation */
  ensurePlace?: (placeId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState<LiveSession | null>(() => readLiveSession());
  const [now, setNow] = useState(() => Date.now());

  /* re-read the blob ~1Hz (countdown precision) plus on bind/storage/wake
     pokes; `now` ticks with it so endsAt math stays second-accurate */
  useEffect(() => {
    const read = () => {
      setLive(readLiveSession());
      setNow(Date.now());
    };
    read();
    return subscribeLiveSession(read);
  }, []);

  /* shell chrome (the header's Timer button) can toggle the card through
     this event — the widget owns its own open state */
  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener('iterra:timer-popup', onToggle);
    return () => window.removeEventListener('iterra:timer-popup', onToggle);
  }, []);

  /* a session that just ended collapses the widget — the place's own
     completion surface (and the session.logged toast) carries the news */
  useEffect(() => {
    if (open && !live) setOpen(false);
  }, [open, live]);

  const phase = livePhase(live, now);
  const remainingMs = live ? liveRemainingMs(live, now) : 0;
  const totalMs = live ? liveTotalMs(live) : 0;
  const progress = totalMs > 0 ? Math.min(1, 1 - remainingMs / totalMs) : 0;
  const sessionLive = phase === 'running' || phase === 'paused';

  const control = (op: 'pause' | 'resume' | 'finish' | 'extend', minutes?: number) => {
    ensurePlace?.('timer');
    void sendTo({
      to: 'timer',
      action: 'timer.control',
      payload: minutes ? { op, minutes } : { op },
    });
  };

  const openTimer = () => onEnter('timer');

  /* passive contract: no live session → no chrome at all */
  if (!sessionLive || !live) return null;

  return (
    <div className="pointer-events-none fixed bottom-[calc(4rem+var(--iterra-bottom-inset,0px))] right-4 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="anim-rise pointer-events-auto it-card w-[300px] max-w-[calc(100vw-2rem)] p-3.5 shadow-[0_16px_40px_-18px_rgb(0_0_0/0.35)]">
          {/* header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <TimerIcon className="h-3.5 w-3.5 text-[var(--color-accent)]" />
              <span className="it-label">Timer</span>
              <span
                className={`ml-1 inline-block h-1.5 w-1.5 rounded-full ${
                  phase === 'paused' ? 'bg-[var(--color-warn)]' : 'bg-[var(--color-accent)] live-dot'
                }`}
              />
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close timer widget"
              className="rounded-[4px] p-1 text-[var(--color-faint)] hover:bg-[var(--color-sheet-hover)] hover:text-[var(--color-ink)] cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* countdown */}
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-[var(--color-ink)]">
                {liveLabel(live)}
              </div>
              <div className="truncate text-[11px] text-[var(--color-mute)]">
                {phase === 'paused' ? 'Paused' : live.isBreak || live.break ? 'Break' : 'Running'}
                {liveCourse(live) ? ` · ${liveCourse(live)}` : ''}
              </div>
            </div>
            <div
              className={`shrink-0 font-mono text-[26px] font-semibold leading-none tabular-nums ${
                phase === 'paused' ? 'text-[var(--color-warn)]' : 'text-[var(--color-accent)]'
              }`}
            >
              {fmtClock(remainingMs)}
            </div>
          </div>

          {/* progress */}
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--color-sheet-2)]">
            <div
              className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-500"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>

          {/* controls — same ops the header pill sends */}
          <div className="mt-3 flex items-center gap-1.5">
            {phase === 'running' ? (
              <button
                type="button"
                onClick={() => control('pause')}
                className="it-btn flex-1 !px-2 !py-1.5 text-[12px]"
                title="Pause session"
              >
                <Pause className="h-3.5 w-3.5" /> Pause
              </button>
            ) : (
              <button
                type="button"
                onClick={() => control('resume')}
                className="it-btn flex-1 !px-2 !py-1.5 text-[12px]"
                title="Resume session"
              >
                <Play className="h-3.5 w-3.5" /> Resume
              </button>
            )}
            <button
              type="button"
              onClick={() => control('extend', 5)}
              className="it-btn-ghost !px-2 !py-1.5 text-[12px]"
              title="Add 5 minutes"
            >
              <Plus className="h-3.5 w-3.5" />5
            </button>
            <button
              type="button"
              onClick={() => control('finish')}
              className="it-btn-ghost !px-2 !py-1.5 text-[12px]"
              title="End early — logs the elapsed time"
            >
              <Check className="h-3.5 w-3.5" />
              End
            </button>
          </div>

          {/* the place stays the deep end — presets, routes, ledger */}
          <button
            type="button"
            onClick={openTimer}
            className="mt-3 flex w-full items-center justify-between rounded-[5px] border-t border-[var(--color-line)] pt-2 text-[11.5px] font-medium text-[var(--color-mute)] hover:text-[var(--color-accent)] cursor-pointer"
          >
            <span>Open Timer</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* collapsed chip — countdown at a glance, tap for controls */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Timer — ${fmtClock(remainingMs)} remaining`}
        title={`${liveLabel(live)} · ${fmtClock(remainingMs)}`}
        className={`pointer-events-auto flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium shadow-[0_10px_28px_-14px_rgb(0_0_0/0.4)] backdrop-blur-sm transition-colors cursor-pointer ${
          phase === 'paused'
            ? 'border-[var(--color-warn)] bg-[var(--color-sheet)] text-[var(--color-warn)]'
            : 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
        }`}
      >
        <TimerIcon className="h-3.5 w-3.5" />
        <span className="font-mono font-semibold tabular-nums">{fmtClock(remainingMs)}</span>
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            phase === 'paused' ? 'bg-[var(--color-warn)]' : 'bg-[var(--color-accent)] live-dot'
          }`}
        />
      </button>
    </div>
  );
}
