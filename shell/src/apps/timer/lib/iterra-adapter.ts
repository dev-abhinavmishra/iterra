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
    remove?(key: string): Promise<unknown>;
  };
  courses?: {
    resolve(ref: unknown): Promise<{ key?: string; id?: string; course?: string; title?: string; data?: { code?: string } } | null>;
    list?(): Promise<Array<{ key?: string; course?: string; title?: string; data?: { code?: string } }>>;
  };
  events?: { emit(t: string, p: Record<string, unknown>): unknown };
  adapter?(o: Record<string, unknown>): void;
  open?(url: string): void;
  isFramed?(): boolean;
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
    url: '/apps/timer/?p=stats',
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
    url: '/apps/timer/?p=stats',
  };
}

export interface TimerStartPayload {
  label?: string;
  minutes?: number;
  commitmentId?: string;
  /** local syllabus block id — binds the session so the outcome reconciles
      the slip and the file-back affordance appears */
  blockId?: string;
  /** canonical '<app>:<type>:<id>' of the material this session practices —
      lands as the outcome's practicedIn edge */
  material?: string;
  courseId?: string;
  course?: string;
  /** recess minutes chained after the session (the link's 'break' param) */
  thenBreak?: number;
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
  if (p.blockId) {
    q.set('block', String(p.blockId));
    /* file-back always returns to the folio — that's where the block lives */
    q.set('return', '/apps/syllabus');
  }
  if (p.material && /^[a-z]{2,16}:[a-z]{2,16}:[^&\s]{1,140}$/.test(p.material)) {
    q.set('mat', p.material);
  }
  if (p.courseId) q.set('courseId', String(p.courseId));
  if (typeof p.thenBreak === 'number' && Number.isFinite(p.thenBreak) && p.thenBreak >= 1 && p.thenBreak <= 60) {
    q.set('break', String(Math.round(p.thenBreak)));
  }
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
  entity?: { id?: string; key?: string; type?: string; title?: string; course?: string; courseId?: string; data?: Record<string, unknown> };
}) {
  const ent = rec?.entity ?? {};
  /* bind the session to whatever was sent — a commitment's id/minutes,
     a block's slip binding, any entity's title/course/material key —
     when the payload didn't spell them */
  const entKey = typeof ent?.key === 'string' ? ent.key : undefined;
  /* a bare course entity IS the binding — its key is canonical — and it
     must not fall into the material slot */
  const entCourseId = ent?.type === 'course'
    ? ent?.courseId ?? entKey ?? ent?.id
    : ent?.courseId;
  const p: TimerStartPayload = {
    minutes: ent?.data?.estimatedMinutes as number | undefined,
    ...((rec?.payload ?? {}) as TimerStartPayload),
    label: rec?.payload?.label ?? ent?.title,
    courseId: rec?.payload?.courseId ?? entCourseId,
    course: rec?.payload?.course ?? ent?.course ?? (ent?.type === 'course' ? ent?.title : undefined),
    commitmentId: rec?.payload?.commitmentId ?? (ent?.type === 'commitment' ? ent?.id : undefined),
    blockId: rec?.payload?.blockId ?? (ent?.type === 'block' ? ent?.id : undefined),
    material:
      rec?.payload?.material ??
      (entKey && !['commitment', 'block', 'course'].includes(ent?.type ?? '') ? entKey : undefined),
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

/* ── terrain navigation — UX-TRACKER #80-82 ───────────────────
   '#/c/<code>' is the shell's course dossier route and
   '/apps/syllabus/?commitment=<id>' the folio deep link — both only
   exist inside the framed terrain, so chips gate on inTerrain() and
   go through iterra.open (guarded: the hub may be absent in tests). */
export function inTerrain(): boolean {
  const it = hub();
  return !!(it?.open && (typeof it.isFramed !== 'function' || it.isFramed()));
}

/* Pending timer.control ops — TimerView drains entries whose state
   precondition holds; entries older than 30s are stale steering and drop.
   localStorage-backed: an op that lands right before the ?intake= landing
   navigates the frame must survive the reload, not die with module state. */
const TIMER_OPS_KEY = 'timer.ops.v1';
export function queuedTimerControls(): { op: string; at: number }[] {
  try {
    const arr = JSON.parse(localStorage.getItem(TIMER_OPS_KEY) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
export function pushTimerControl(op: string) {
  try {
    const arr = queuedTimerControls();
    arr.push({ op, at: Date.now() });
    localStorage.setItem(TIMER_OPS_KEY, JSON.stringify(arr.slice(-8)));
  } catch { /* full/blocked storage — the live event path still works */ }
}
export function dequeueTimerControl(entry: { op: string; at: number }) {
  try {
    localStorage.setItem(TIMER_OPS_KEY, JSON.stringify(
      queuedTimerControls().filter((x) => !(x.op === entry.op && x.at === entry.at)),
    ));
  } catch { /* best-effort */ }
}

export function openTerrain(url: string) {
  hub()?.open?.(url);
}

/* display code for a bound course — registry first, given label as
   fallback (same resolve the intake uses; never fabricates) */
export async function boundCourseCode(courseId?: string, course?: string): Promise<string | null> {
  if (course && !course.includes(':')) return course;
  const c = await boundCourse(courseId, course);
  const code = c.course;
  return code && !code.includes(':') ? code : null;
}

/* ── recent courses — UX-TRACKER #81 ──────────────────────────
   "Recent" = most recently active course bindings across session
   entities (store.list sorts by updatedAt desc), falling back to the
   course registry when the store has no sessions yet. */
export interface RecentCourse { course: string; courseId?: string }

export async function recentCourses(limit = 4): Promise<RecentCourse[]> {
  const it = hub();
  if (!it?.store?.list) return [];
  const seen = new Set<string>();
  const out: RecentCourse[] = [];
  const push = (course?: string, courseId?: string) => {
    if (!course || course.includes(':')) return; /* a canonical key is never a chip label */
    const k = (courseId ?? course).toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ course, courseId });
  };
  try {
    for (const s of (await it.store.list({ type: 'session' })) ?? []) {
      push((s as { course?: string }).course, (s as { courseId?: string }).courseId);
    }
  } catch { /* keep whatever resolved */ }
  if (out.length < limit && it?.courses?.list) {
    try {
      for (const c of (await it.courses.list()) ?? []) {
        push(c?.data?.code ?? c?.course ?? c?.title, c?.key);
        if (out.length >= limit) break;
      }
    } catch { /* fine — chips are optional */ }
  }
  return out.slice(0, limit);
}

let listening = false;
function listenSessions() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('timer:session', (e) => {
    void onSessionSaved((e as CustomEvent<Session>).detail);
  });
  /* per-session delete in Stats — the canonical mirror goes too, or the
     row would keep surfacing in dossiers/search after deletion */
  window.addEventListener('timer:session-removed', (e) => {
    const id = (e as CustomEvent<{ id?: string }>).detail?.id;
    if (!id) return;
    void hub()?.store?.remove?.(`timer:session:${id}`).catch(() => {});
  });
  window.addEventListener('timer:sessions-cleared', () => {
    void (async () => {
      const it = hub();
      if (!it?.store?.list || !it.store.remove) return;
      try {
        for (const e of await it.store.list({ app: 'timer', type: 'session' })) {
          if (e?.id) await it.store.remove(`timer:session:${e.id}`).catch(() => {});
        }
      } catch { /* mirror cleanup is best-effort */ }
    })();
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
         it against the real countdown. Ops: pause | resume | finish.
         The op queues BEFORE dispatch — an op landing while the view is
         still mounting (the ?intake= landing just navigated this frame)
         would otherwise dispatch into nothing yet report delivered. */
      'timer.control': async (rec: { payload?: { op?: string } }) => {
        const op = rec?.payload?.op;
        if (op !== 'pause' && op !== 'resume' && op !== 'finish') return { ok: false };
        pushTimerControl(op);
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
