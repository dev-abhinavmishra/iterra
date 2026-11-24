/* Passive read-side of the Timer place's live-session record.

   TimerView mirrors the countdown into localStorage
   'timer.session.live.v1' — the reload-restore source of truth — and the
   shared.focus commons doc. The shell popup reads the blob directly so it
   can show (and steer) a session without importing the timer bundle: this
   module is dependency-free and safe to bundle into the shell chunk. */

export const LIVE_SESSION_KEY = 'timer.session.live.v1';

export interface LiveSession {
  sessionId?: string;
  label?: string;
  intent?: string;
  running?: boolean;
  paused?: boolean;
  endsAt?: number;
  remainingSec?: number;
  totalMin?: number;
  isBreak?: boolean;
  break?: boolean;
  course?: string;
  courseId?: string;
  syllabus?: {
    course?: string;
    courseId?: string;
    block?: string;
    returnUrl?: string;
    from?: string;
  } | null;
  thenBreak?: number;
  /** last publish stamp — TimerView rewrites the blob on every beat, so a
      paused session's heartbeat keeps this fresh while the page lives */
  at?: number;
}

export function readLiveSession(): LiveSession | null {
  try {
    const raw = localStorage.getItem(LIVE_SESSION_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as LiveSession) : null;
  } catch {
    return null;
  }
}

export type LivePhase = 'idle' | 'running' | 'paused' | 'ended';

/* A paused blob outlives its page: the writer's 60s heartbeat is what
   proves the session is still alive (same freshness contract the shell
   header applies to shared.focus). A missing stamp is a pre-stamp blob —
   treated as fresh so an upgrade doesn't hide a real paused session. */
const PAUSED_FRESH_MS = 3 * 60 * 1000;

export function pausedIsFresh(live: LiveSession, now = Date.now()): boolean {
  return typeof live.at !== 'number' || now - live.at < PAUSED_FRESH_MS;
}

export function livePhase(live: LiveSession | null, now = Date.now()): LivePhase {
  if (!live) return 'idle';
  if (live.running && typeof live.endsAt === 'number') {
    /* endsAt self-expires — an observed countdown that ran out while the
       tab was dead reads as 'ended', not a zombie running session */
    return live.endsAt > now ? 'running' : 'ended';
  }
  if (live.paused) return pausedIsFresh(live, now) ? 'paused' : 'idle';
  return 'idle';
}

export function liveRemainingMs(live: LiveSession, now = Date.now()): number {
  if (live.running && typeof live.endsAt === 'number') {
    return Math.max(0, live.endsAt - now);
  }
  if (live.paused && typeof live.remainingSec === 'number') {
    return Math.max(0, live.remainingSec * 1000);
  }
  return 0;
}

export function liveTotalMs(live: LiveSession): number {
  return Math.max(0, (live.totalMin || 0) * 60000);
}

export function liveLabel(live: LiveSession): string {
  if (live.isBreak || live.break) return 'Break';
  return live.label || live.intent || 'Focus';
}

export function liveCourse(live: LiveSession): string | undefined {
  return live.syllabus?.course || live.course || undefined;
}

/* Cheap poll target for the popup — read on an interval plus whenever the
   app signals timer activity. Same-tab localStorage writes don't fire
   'storage', so the interval is the real mechanism; events just tighten
   latency. */
export function subscribeLiveSession(cb: () => void): () => void {
  const onStorage = (ev: StorageEvent) => {
    if (ev.key === LIVE_SESSION_KEY || ev.key === 'iterra.v1.doc.shared') cb();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener('timer:bind-session', cb);
  window.addEventListener('iterra:authoritative-write', cb);
  const t = window.setInterval(cb, 1000);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('timer:bind-session', cb);
    window.removeEventListener('iterra:authoritative-write', cb);
    window.clearInterval(t);
  };
}
