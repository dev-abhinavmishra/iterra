/* iterra adapter — Timer (workflow D middle).
   Publishes each completed focus session as a {type:'session'} entity and
   emits 'session.completed'; answers the 'timer.start' intake with a bound
   deep link the app's own deeplink parser already understands
   (?intent&minutes&course&from&autostart&commitment&courseId).
   Everything is guarded — standalone (no hub) keeps every old behaviour. */
import { getSessions } from './stats';
import type { Session } from './stats';
import { timerSummary, publishRoutineIndex } from './iterra';

type Hub = {
  ready?: Promise<unknown>;
  store?: {
    put(e: Record<string, unknown>): Promise<unknown>;
    get(k: string): Promise<unknown>;
    list(q?: Record<string, unknown>): Promise<Array<{ id?: string }>>;
  };
  courses?: { resolve(ref: unknown): Promise<{ key?: string; id?: string; course?: string; title?: string; data?: { code?: string } } | null> };
  events?: { emit(t: string, p: Record<string, unknown>): unknown };
  adapter?(o: Record<string, unknown>): void;
};
const hub = (): Hub | undefined => (typeof window !== 'undefined' ? (window as { iterra?: Hub }).iterra : undefined);

/* ── pure builders (contract-tested) ──────────────────────────────── */

export interface BoundCourse { courseId?: string; course?: string }

export function sessionEntity(s: Session, bound: BoundCourse = {}) {
  const minutes = Math.round(s.duration / 60);
  const label = s.label || s.preset || 'focus';
  return {
    app: 'timer',
    type: 'session',
    id: s.id,
    courseId: bound.courseId ?? s.courseId,
    course: bound.course ?? s.course,
    title: label,
    sub: `${minutes}m`,
    url: '/apps/timer/',
    createdAt: s.timestamp,
    data: {
      minutes,
      label,
      commitmentId: s.commitmentId,
      startedAt: s.timestamp - Math.round(s.duration * 1000),
      endedAt: s.timestamp,
    },
  };
}

export function sessionCompletedEvent(s: Session, bound: BoundCourse = {}) {
  const minutes = Math.round(s.duration / 60);
  const label = s.label || s.preset || 'focus';
  return {
    sessionId: s.id,
    minutes,
    courseId: bound.courseId ?? s.courseId,
    course: bound.course ?? s.course,
    text: `focus · ${minutes}m — ${label}`,
    url: '/apps/timer/',
  };
}

export interface TimerStartPayload {
  label?: string;
  minutes?: number;
  commitmentId?: string;
  courseId?: string;
  course?: string;
}

export function timerStartUrl(from: string | undefined, p: TimerStartPayload): string {
  const q = new URLSearchParams();
  q.set('intent', String(p.label || p.course || 'focus session').slice(0, 120));
  if (typeof p.minutes === 'number' && Number.isFinite(p.minutes) && p.minutes >= 1 && p.minutes <= 720) {
    q.set('minutes', String(Math.round(p.minutes)));
  }
  if (p.course) q.set('course', String(p.course));
  q.set('from', from && /^[a-z]{2,16}$/.test(from) ? from : 'terrain');
  if (p.commitmentId) q.set('commitment', String(p.commitmentId));
  if (p.courseId) q.set('courseId', String(p.courseId));
  q.set('autostart', '1');
  return '/apps/timer/?' + q.toString();
}

/* ── hub plumbing ─────────────────────────────────────────────────── */

/* canonical key + display code for whatever the session/intake carried —
   resolves through the registry, never fabricates */
async function boundCourse(courseId?: string, course?: string): Promise<BoundCourse> {
  const it = hub();
  if (!it?.courses) return { courseId, course };
  try {
    const ref = courseId ? { courseId } : course;
    if (!ref) return {};
    const c = await it.courses.resolve(ref);
    return { courseId: c?.key ?? courseId, course: c?.data?.code ?? c?.course ?? c?.id ?? course };
  } catch {
    return { courseId, course };
  }
}

async function onSessionSaved(s?: Session) {
  const it = hub();
  if (!it?.store || !s || s.type !== 'focus') return;
  const bound = await boundCourse(s.courseId, s.course);
  await it.store.put(sessionEntity(s, bound));
  it.events?.emit('session.completed', sessionCompletedEvent(s, bound));
}

/* sweep: mirror focus sessions the event didn't catch (saved while the hub
   was absent or before this adapter shipped) — idempotent puts, capped */
async function backfillSessions() {
  const it = hub();
  if (!it?.store?.list) return;
  try {
    const have = new Set((await it.store.list({ app: 'timer', type: 'session' })).map((e) => e.id));
    const missing = getSessions()
      .filter((s) => s.type === 'focus' && !have.has(s.id))
      .slice(-100);
    for (const s of missing) {
      const bound = await boundCourse(s.courseId, s.course);
      await it.store.put(sessionEntity(s, bound));
    }
  } catch {
    /* best-effort mirror — never block the app */
  }
}

async function onTimerStart(rec: {
  from?: string;
  payload?: TimerStartPayload;
  entity?: { id?: string; type?: string; title?: string; course?: string; courseId?: string; data?: Record<string, unknown> };
}) {
  const ent = rec?.entity ?? {};
  /* bind the session to whatever was sent — a commitment's id/minutes,
     any entity's title and course — when the payload didn't spell them */
  const p: TimerStartPayload = {
    minutes: ent?.data?.estimatedMinutes as number | undefined,
    ...((rec?.payload ?? {}) as TimerStartPayload),
    label: rec?.payload?.label ?? ent?.title,
    courseId: rec?.payload?.courseId ?? ent?.courseId,
    course: rec?.payload?.course ?? ent?.course,
    commitmentId: rec?.payload?.commitmentId ?? (ent?.type === 'commitment' ? ent?.id : undefined),
  };
  let course = p.course;
  /* a canonical key ('app:course:id') is never a display label — resolve
     it (or a bare courseId) to the registry's code */
  if ((course && course.includes(':')) || (!course && p.courseId)) {
    try {
      const c = await hub()?.courses?.resolve({ courseId: p.courseId ?? course });
      course = c?.data?.code ?? c?.course ?? c?.id ?? course;
    } catch { /* keep the code we were given */ }
  }
  return { url: timerStartUrl(rec?.from, { ...p, course }) };
}

let listening = false;
function listenSessions() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('timer:session', (e) => {
    void onSessionSaved((e as CustomEvent<Session>).detail);
  });
}

export function registerAdapter() {
  const it = hub();
  if (!it?.adapter) return;
  it.adapter({
    name: 'timer',
    title: 'Timer',
    summary: timerSummary,
    intakes: {
      'timer.start': onTimerStart,
      /* steer a live session from anywhere in the terrain: the ambient
         rail's ❚❚/▶/✓ sends {op} here; TimerView's own listener executes
         it against the real countdown. Ops: pause | resume | finish. */
      'timer.control': async (rec: { payload?: { op?: string } }) => {
        const op = rec?.payload?.op;
        if (op !== 'pause' && op !== 'resume' && op !== 'finish') return { ok: false };
        window.dispatchEvent(new CustomEvent('timer:control', { detail: { op } }));
        return { url: '/apps/timer/' };
      },
    },
    wake: () => {
      publishRoutineIndex();
      void backfillSessions();
    },
  });
  listenSessions();
  void backfillSessions();
}

registerAdapter();
