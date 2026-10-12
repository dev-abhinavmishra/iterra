/* iterra adapter — rhythm's one door to the canonical store.
   Contract: docs/ADAPTER.md. Store writes, event emissions, and intake
   handlers for this app all live here.

   What this does:
   • publishes 'routine' + 'entry' entities, diff-aware and incremental
   • answers 'log.activity' intakes — a register mark from a sibling app
   • subscribes the canonical event bus (session.completed, card.reviewed,
     grade.entered, attempt.diverged) into the same event pipeline the
     legacy ?event deep link uses — dedup'd by evidence id, since senders
     may deliver the same news over both channels
   • emits routine.logged / routine.completed (textless — the terrain feed
     rows still come from the legacy feed() call in iterra.ts) */

import { useRegister } from '../store';
import { addDaysISO, dateOfInstant, nowISO, todayISO } from './dates';
import { dayState, entriesOn, isScheduled } from './register';
import { KNOWN_APPS } from './events';
import type { Entry, Routine, SuiteApp } from './types';

declare const window: any;

/* ── pure helpers (contract-tested) ─────────────────────────────────────── */

/** The senders' loose `kind` vocabulary, normalized onto canonical types. */
const KIND_TO_TYPE: Record<string, string> = {
  session: 'session.completed',
  'session.completed': 'session.completed',
  'card.reviewed': 'card.reviewed',
  'card.created': 'card.created',
  grade: 'grade.entered',
  'grade.entered': 'grade.entered',
  diverged: 'attempt.diverged',
  'attempt.diverged': 'attempt.diverged',
  'attempt.made': 'attempt.made',
  note: 'note.created',
  'note.created': 'note.created',
};

export function canonType(kind: unknown): string {
  const k = typeof kind === 'string' ? kind.trim() : '';
  return KIND_TO_TYPE[k] ?? (k || 'session.completed');
}

/** The semantic id of the record an event is about — shared by both
    delivery channels (a flashcards card.reviewed carries cardId whether it
    arrives as a bus record or a log.activity payload). */
function payloadEntityId(payload: Record<string, unknown> | undefined, entity: any): string | null {
  const p = payload ?? {};
  const cand = [
    p.cardId, p.attemptId, p.gradeId, p.sessionId, p.assignmentId,
    p.entityId, p.entryId, p.sendId, p.id, entity?.id,
  ];
  for (const c of cand) if (typeof c === 'string' && c) return c;
  return null;
}

/** Stable RoutineEvent id for one canonical delivery. Records carrying a
    payload entity id dedup across intake+bus; ones without fall back to the
    record's own seq/id/at so a redelivery still dedups. */
export function canonEventId(rec: { app?: string; type?: string; seq?: number; id?: string; at?: number; payload?: any; entity?: any }): string {
  const tail =
    payloadEntityId(rec.payload, rec.entity) ??
    (rec.seq !== undefined ? `s${rec.seq}` : undefined) ??
    rec.id ??
    `t${rec.at ?? 0}`;
  return `evt_hub_${rec.app ?? 'unknown'}_${rec.type ?? 'event'}_${tail}`.replace(/[^\w:.-]+/g, '_');
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
}

function toISO(v: unknown, fallbackMs: number | undefined): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v).toISOString();
  if (typeof v === 'string' && !Number.isNaN(new Date(v).getTime())) return new Date(v).toISOString();
  return typeof fallbackMs === 'number' ? new Date(fallbackMs).toISOString() : null;
}

/** resourceId is the evidence target — the record a source-link can open. */
function payloadResourceId(payload: Record<string, unknown> | undefined, entity: any): string | undefined {
  const p = payload ?? {};
  const cand = [
    p.deckId, p.noteId, p.problemId, p.assignmentId, p.cardId,
    p.sessionId, p.attemptId, p.gradeId, entity?.id,
  ];
  for (const c of cand) if (typeof c === 'string' && c) return c;
  return undefined;
}

function baseDraft(rec: { app?: string; type?: string; at?: number; seq?: number; id?: string; payload?: any; entity?: any }, type: string, atISO: string) {
  const p = rec.payload ?? {};
  const app: SuiteApp = KNOWN_APPS.includes(rec.app as SuiteApp) ? (rec.app as SuiteApp) : 'other';
  const durationSeconds =
    num(p.durationSeconds) ?? num(p.seconds) ?? (num(p.minutes) !== undefined ? Math.round(num(p.minutes)! * 60) : undefined);
  const metrics: Record<string, number> = {};
  if (p.metrics && typeof p.metrics === 'object') {
    for (const [k, v] of Object.entries(p.metrics as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) metrics[k] = v;
    }
  }
  if (num(p.minutes) !== undefined && metrics.minutes === undefined) metrics.minutes = num(p.minutes)!;
  return {
    id: canonEventId(rec),
    type,
    occurredAt: atISO,
    sourceApp: app,
    ...(durationSeconds ? { durationSeconds } : {}),
    ...(payloadResourceId(p, rec.entity) ? { resourceId: payloadResourceId(p, rec.entity) } : {}),
    ...(Object.keys(metrics).length ? { metrics } : {}),
  };
}

/** Bus record {type,app,payload,at,seq?} → a RoutineEvent draft the register's
    own intake pipeline (dedup + mappings) can take. */
export function busEventDraft(rec: { type?: string; app?: string; payload?: any; at?: number; seq?: number }): Record<string, unknown> | null {
  if (!rec?.type || !rec.at) return null;
  const occurredAt = toISO(rec.payload?.at, rec.at);
  if (!occurredAt) return null;
  const app: SuiteApp = KNOWN_APPS.includes(rec.app as SuiteApp) ? (rec.app as SuiteApp) : 'other';
  /* type becomes '<app>.<canonical>' — 'timer.session.completed' lands on the
     legacy vocabulary, so existing app.* mappings keep matching. */
  return { ...baseDraft(rec, `${app}.${rec.type}`, occurredAt), sourceApp: app };
}

/** log.activity intake record → the same draft shape as a bus event, so the
    register's dedup (by evidence id) catches double delivery. */
export function logActivityDraft(rec: { id?: string; from?: string; entity?: any; payload?: any; at?: number }): Record<string, unknown> | null {
  const p = rec?.payload ?? {};
  const type = canonType(p.kind);
  const occurredAt = toISO(p.at, rec?.at) ?? nowISO();
  const app: SuiteApp = KNOWN_APPS.includes(rec?.from as SuiteApp) ? (rec!.from as SuiteApp) : 'other';
  return {
    ...baseDraft({ app: rec?.from, type, at: rec?.at, id: rec?.id, payload: p, entity: rec?.entity }, `${app}.${type}`, occurredAt),
    sourceApp: app,
  };
}

/* ── entity shapes ──────────────────────────────────────────────────────── */

/** Consecutive days marked, walking back from today. Scheduled misses break;
    unscheduled/exception/paused days neither extend nor break; today unmarked
    keeps yesterday's streak alive. */
export function streakDays(
  routine: Routine,
  entries: Record<string, Entry>,
  exceptions: Record<string, import('./types').DayException>,
  today: string = todayISO(),
): number {
  let streak = 0;
  let cur = today;
  for (let i = 0; i < 370; i++) {
    const st = dayState(routine, cur, entries, exceptions, today);
    if (st === 'full' || st === 'minimum' || st === 'partial') {
      streak++;
    } else if (st === 'missed' && cur !== today) {
      break;
    }
    cur = addDaysISO(cur, -1);
    if (dateOfInstant(routine.createdAt) > cur) break;
  }
  return streak;
}

export function routineEntity(
  r: Routine,
  opts: { course?: string; courseId?: string; streak?: number } = {},
): Record<string, unknown> {
  return {
    app: 'rhythm',
    type: 'routine',
    id: r.id,
    title: r.name,
    ...(opts.course ? { course: opts.course } : {}),
    ...(opts.courseId ? { courseId: opts.courseId } : {}),
    url: `/apps/rhythm/?routine=${encodeURIComponent(r.name)}`,
    data: {
      days: r.weekdays,
      streak: opts.streak ?? 0,
      measure: r.measure,
      perWeek: r.target.perWeek,
      status: r.status,
    },
  };
}

export function entryEntity(
  e: Entry,
  r: Routine | undefined,
  opts: { course?: string; courseId?: string; eventKind?: string } = {},
): Record<string, unknown> {
  const kind = e.isMinimum ? 'minimum' : opts.eventKind ?? (r?.measure === 'check' ? 'check' : r?.measure ?? 'check');
  return {
    app: 'rhythm',
    type: 'entry',
    id: e.id,
    title: r?.name ?? 'a channel',
    sub: e.date,
    ...(opts.course ? { course: opts.course } : {}),
    ...(opts.courseId ? { courseId: opts.courseId } : {}),
    url: '/apps/rhythm/',
    data: {
      day: e.date,
      kind,
      ...(r?.measure === 'duration' || r?.unit === 'minutes' ? { minutes: e.value } : {}),
      value: e.value,
      routineId: e.routineId,
      ...(e.eventId ? { eventId: e.eventId } : {}),
    },
  };
}

/* ── shared plan mapping — UX-TRACKER #72 ─────────────────────
   The 'routine.plan' intake and the register's "from the folio"
   inbox create identical routines from the same payload fields, so
   the mapping lives here once (contract in docs/ADAPTER.md). */
const hub = () => (typeof window !== 'undefined' ? window.iterra : undefined);

/* Project the canonical course on a payload into a local CourseRef so the
   event lands coursed — match on code/name, else create the projection.
   The canonical key itself stays out of the register's local-id field. */
const projectCourse = async (payload: Record<string, unknown>): Promise<string | undefined> => {
  const it = hub();
  let label: string | undefined = typeof payload.course === 'string' ? payload.course : undefined;
  if (!label && typeof payload.courseId === 'string' && it?.store?.get) {
    try {
      const ent = await it.store.get(payload.courseId);
      label = ent?.data?.code ?? ent?.course ?? ent?.title;
    } catch { /* uncoursed is fine */ }
  }
  if (!label) return undefined;
  const s = useRegister.getState();
  const lower = String(label).toLowerCase();
  const found = Object.values(s.courses).find(
    (c) => (c.code ?? c.name).toLowerCase() === lower,
  );
  return (found ?? s.addCourse({ name: String(label) })).id;
};

export interface RoutinePlanFields {
  name?: string; entityTitle?: string;
  course?: string; courseId?: string;
  dueAt?: string; perWeek?: number; minutes?: number; unit?: string;
}

export async function planRoutine(p: RoutinePlanFields): Promise<Routine | null> {
  const name = typeof p.name === 'string' && p.name.trim() ? p.name.trim() : p.entityTitle;
  if (!name) return null;
  const cid = await projectCourse(p as Record<string, unknown>);
  const due = typeof p.dueAt === 'string' ? p.dueAt.slice(0, 10) : undefined;
  const minutes = Number(p.minutes) > 0 ? Math.round(Number(p.minutes)) : undefined;
  const routine = useRegister.getState().addRoutine({
    name,
    measure: 'count',
    unit: p.unit || (minutes ? 'min' : 'times'),
    perWeek: Math.max(1, Math.min(14, Math.round(Number(p.perWeek) || 1))),
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    minimumLabel: minutes ? `${minutes}m` : undefined,
    courseId: cid || undefined,
    windowEnd: due,
  });
  try {
    hub()?.events?.emit?.('routine.planned', {
      routineId: routine.id, name: routine.name, courseId: cid || undefined,
      via: 'routine.plan',
    });
  } catch { /* journal is best-effort */ }
  return routine;
}

/* ── folio inbox — UX-TRACKER #72 ─────────────────────────────
   Read side of the 'routine.plan' contract: recent OPEN commitments
   published by the syllabus folio (data.status === 'open'), due-soon
   then newest, so the register can offer them as one-click scaffolds. */
export interface FolioCommitment {
  id: string;
  title: string;
  dueAt?: string;
  estimatedMinutes?: number;
  course?: string;
  courseId?: string;
  url?: string;
}

export async function folioInbox(limit = 4): Promise<FolioCommitment[]> {
  const it = hub();
  if (!it?.store?.list) return [];
  try {
    const rows = (await it.store.list({ app: 'syllabus', type: 'commitment' })) ?? [];
    const open = (rows as any[]).filter((r) => r?.data?.status === 'open');
    open.sort((a, b) => {
      const ad = typeof a?.data?.dueAt === 'string' ? Date.parse(a.data.dueAt) : Number.POSITIVE_INFINITY;
      const bd = typeof b?.data?.dueAt === 'string' ? Date.parse(b.data.dueAt) : Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd; /* due-soon first; undated commitments last */
      return (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0);
    });
    return open.slice(0, limit).map((r) => ({
      id: String(r.id),
      title: r.title ?? 'a commitment',
      dueAt: typeof r?.data?.dueAt === 'string' ? r.data.dueAt : undefined,
      estimatedMinutes: Number.isFinite(r?.data?.estimatedMinutes) ? Number(r.data.estimatedMinutes) : undefined,
      course: r.course,
      courseId: r.courseId,
      url: r.url,
    }));
  } catch {
    return [];
  }
}

/* Plan one folio row — identical fields to the 'routine.plan' intake. */
export function planFolio(c: FolioCommitment): Promise<Routine | null> {
  return planRoutine({
    name: c.title,
    course: c.course,
    courseId: c.courseId,
    dueAt: c.dueAt,
    minutes: c.estimatedMinutes,
  });
}

/* ── registered adapter ─────────────────────────────────────────────────── */

let registered = false;

export function registerAdapter() {
  if (registered) return;
  const it = window.iterra;
  if (!it?.adapter || !it?.store) return;
  registered = true;

  /* canonical course key cache — resolved via courses.byCode, never made up */
  const courseKeyCache = new Map<string, Promise<string | null>>();
  const canonicalCourseKey = (label?: string): Promise<string | null> => {
    const c = (label ?? '').trim();
    if (!c || !it.courses?.byCode) return Promise.resolve(null);
    if (!courseKeyCache.has(c)) {
      courseKeyCache.set(
        c,
        Promise.resolve(it.courses.byCode(c))
          .then((e: any) => e?.key ?? null)
          .catch(() => null),
      );
    }
    return courseKeyCache.get(c)!;
  };

  const localCourse = (cid: string | undefined) => {
    if (!cid) return undefined;
    const c = useRegister.getState().courses[cid];
    return c ? (c.code ?? c.name) : undefined;
  };

  /* ── incremental publish: dirty sets + a serialized drain, so a burst of
     check-ins lands as one write per changed entity, in order ── */
  const dirtyRoutines = new Set<string>();
  const dirtyEntries = new Set<string>();
  const removed = new Set<string>();
  let knownRoutineIds = new Set<string>();
  let knownEntryIds = new Set<string>();
  let knownCourseIds = new Set<string>();
  let drainP: Promise<void> = Promise.resolve();
  let drainScheduled = false;

  const markAll = () => {
    const s = useRegister.getState();
    for (const id of Object.keys(s.routines)) dirtyRoutines.add(id);
    for (const id of Object.keys(s.entries)) dirtyEntries.add(id);
  };

  const diffState = () => {
    const s = useRegister.getState();
    const routineIds = new Set(Object.keys(s.routines));
    const entryIds = new Set(Object.keys(s.entries));
    const courseIds = new Set(Object.keys(s.courses));
    for (const id of entryIds) if (!knownEntryIds.has(id)) dirtyEntries.add(id);
    /* routines republish on every state change — their entity carries the
       streak, which entries landing/removing move; the published-snapshot
       diff below keeps it to one put per real change */
    for (const id of routineIds) dirtyRoutines.add(id);
    for (const id of courseIds) if (!knownCourseIds.has(id)) {
      /* a new local course may resolve canonical keys for linked entities */
      for (const rid of routineIds) dirtyRoutines.add(rid);
      for (const eid of entryIds) dirtyEntries.add(eid);
    }
    for (const id of knownRoutineIds) if (!routineIds.has(id)) removed.add(`rhythm:routine:${id}`);
    for (const id of knownEntryIds) if (!entryIds.has(id)) removed.add(`rhythm:entry:${id}`);
    /* entry contents can change in place (note edits) — republish cheaply by
       diffing the published snapshot below; mark all as dirty is avoided by
       keeping per-entity json snapshots */
    knownRoutineIds = routineIds;
    knownEntryIds = entryIds;
    knownCourseIds = courseIds;
  };

  /* published snapshots — an entity is only put when its wire shape moved */
  const published = new Map<string, string>();
  const queueDrain = () => {
    if (drainScheduled) return;
    drainScheduled = true;
    drainP = drainP.then(drain).catch(() => {}).finally(() => {
      drainScheduled = false;
      /* state may have moved while draining — schedule a follow-up pass */
      if (dirtyRoutines.size || dirtyEntries.size || removed.size) queueDrain();
    });
  };

  async function drain(): Promise<void> {
    const s = useRegister.getState();
    for (const key of [...removed]) {
      removed.delete(key);
      if (published.delete(key)) await it.store.remove(key).catch(() => {});
    }
    for (const id of [...dirtyRoutines]) {
      dirtyRoutines.delete(id);
      const r = s.routines[id];
      if (!r) continue;
      const label = localCourse(r.courseId);
      const key = await canonicalCourseKey(label);
      const ent = routineEntity(r, {
        course: label,
        courseId: key ?? undefined,
        streak: streakDays(r, s.entries, s.exceptions),
      });
      const j = JSON.stringify(ent);
      if (published.get(`rhythm:routine:${id}`) !== j) {
        published.set(`rhythm:routine:${id}`, j);
        await it.store.put(ent).catch(() => {});
      }
    }
    for (const id of [...dirtyEntries]) {
      dirtyEntries.delete(id);
      const e = s.entries[id];
      if (!e) continue;
      const r = s.routines[e.routineId];
      /* course label: the routine's course when it has one, else the course
         projected by the event that wrote this entry */
      const evCourse = e.eventId ? s.events[e.eventId]?.courseId : undefined;
      const label = localCourse(r?.courseId) ?? localCourse(evCourse);
      const key = await canonicalCourseKey(label);
      const ent = entryEntity(e, r, {
        course: label,
        courseId: key ?? undefined,
        eventKind: e.eventId ? s.events[e.eventId]?.type.split('.').slice(1).join('.') : undefined,
      });
      const j = JSON.stringify(ent);
      if (published.get(`rhythm:entry:${id}`) !== j) {
        published.set(`rhythm:entry:${id}`, j);
        await it.store.put(ent).catch(() => {});
      }
    }
  }

  /* seeded snapshot so the first diff sees the store as the source of truth */
  const hydrated = useRegister.persist?.hasHydrated?.() ?? true;
  const start = () => {
    const s = useRegister.getState();
    knownRoutineIds = new Set(Object.keys(s.routines));
    knownEntryIds = new Set(Object.keys(s.entries));
    knownCourseIds = new Set(Object.keys(s.courses));
    markAll();
    queueDrain();
  };
  if (hydrated) start();
  else useRegister.persist?.onFinishHydration?.(start);

  /* bus events → the register's event pipeline. dedup: canonEventId carries
     the payload's evidence id, so a card.reviewed that also arrived as a
     log.activity intake is absorbed as a duplicate. */
  const WATCHED = ['session.completed', 'card.reviewed', 'grade.entered', 'attempt.diverged'];
  const ingest = (raw: unknown) => {
    try {
      useRegister.getState().intakeRaw(raw);
    } catch {
      /* a malformed record is a dead letter, not a crash */
    }
  };

  /* course projection for deliveries is the module-level projectCourse above —
     shared with the folio inbox so intake and inbox resolve the same way */

  if (it.events?.on) {
    for (const t of WATCHED) {
      it.events.on(t, (rec: any) => {
        const draft = busEventDraft(rec);
        if (!draft) return;
        /* course projection is async — ingest when it resolves; the dedup id
           is already fixed so ordering between channels doesn't matter */
        Promise.resolve(projectCourse(rec?.payload ?? {}))
          .then((cid) => { if (cid) draft.courseId = cid; ingest(draft); })
          .catch(() => ingest(draft));
      });
    }
  }

  /* emits: a new entry is 'routine.logged'; the last open line closing is
     'routine.completed'. No text payloads — the feed's rows stay with the
     legacy feed() calls in iterra.ts. */
  let lastEntryIds: Set<string> | null = null;
  let prevPending: number | null = null;
  const pendingNow = (): number | null => {
    const s = useRegister.getState();
    const today = todayISO();
    const due = Object.values(s.routines).filter((r) => r.status === 'active' && isScheduled(r, today));
    const marked = due.filter((r) => entriesOn(s.entries, r.id, today).length > 0).length;
    return Math.max(0, due.length - marked);
  };
  useRegister.subscribe((s) => {
    diffState();
    queueDrain();
    if (!it.events?.emit) return;
    const ids = new Set(Object.keys(s.entries));
    if (lastEntryIds) {
      for (const id of ids) {
        if (lastEntryIds.has(id)) continue;
        const e = s.entries[id];
        const r = e ? s.routines[e.routineId] : null;
        it.events.emit('routine.logged', {
          routineId: e?.routineId,
          entryId: id,
          date: e?.date,
          course: localCourse(r?.courseId),
          url: '/apps/rhythm/',
        }).catch(() => {});
      }
      const p = pendingNow();
      if (prevPending !== null && prevPending > 0 && p === 0) {
        it.events.emit('routine.completed', { date: todayISO(), url: '/apps/rhythm/' }).catch(() => {});
      }
      prevPending = p;
    } else {
      prevPending = pendingNow();
    }
    lastEntryIds = ids;
  });

  it.adapter({
    name: 'rhythm',
    title: 'Rhythm',
    /* same {marked,total,pending} the rail already reads — the adapter's
       register() call replaces the bridge's, so the shape must not drift */
    summary: () => {
      const s = useRegister.getState();
      const today = todayISO();
      const due = Object.values(s.routines).filter((r) => r.status === 'active' && isScheduled(r, today));
      const marked = due.filter((r) => entriesOn(s.entries, r.id, today).length > 0).length;
      return { marked, total: due.length, pending: Math.max(0, due.length - marked) };
    },
    intakes: {
      /* {kind,minutes?,course?,courseId?,label?,at?} → a register event;
         resolved courses get projected into local refs so mappings and the
         course filter see them (the canonical key stays on the payload). */
      'log.activity': async (rec: any) => {
        const draft = logActivityDraft(rec) as Record<string, unknown> | null;
        if (draft) {
          const cid = await projectCourse(rec?.payload ?? {});
          if (cid) draft.courseId = cid;
          ingest(draft);
        }
        return { url: '/apps/rhythm/' };
      },
      /* {name, course?, courseId?, dueAt?, perWeek?, minutes?, unit?} →
         a real Routine on the register: syllabus's 'plan on the register'
         sends a commitment here so it's scheduled where marks happen.
         The canonical course key is projected into a local ref first. */
      'routine.plan': async (rec: any) => {
        const p = (rec?.payload ?? {}) as Record<string, any>;
        /* same mapping the register's folio inbox uses — see planRoutine */
        const routine = await planRoutine({ ...(p as RoutinePlanFields), entityTitle: rec?.entity?.title });
        if (!routine) return { ok: false };
        return { url: `/apps/rhythm/?routine=${encodeURIComponent(routine.name)}`, toast: `${routine.name} — on the register` };
      },
    },
    /* a keep-alive frame waking up: re-run the diff in case it missed ticks */
    wake: () => {
      diffState();
      queueDrain();
    },
  });
}

if (typeof window !== 'undefined') registerAdapter();
