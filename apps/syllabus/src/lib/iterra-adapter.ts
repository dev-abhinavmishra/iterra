/* ── iterra adapter — syllabus's door to the canonical store ──────────────────
   Contract: docs/ADAPTER.md. This file is the ONLY place `iterra.adapter()`
   is called; the commons/index/feed ambient layer stays in lib/iterra.ts.

   Syllabus is the course-registry owner: its Term/Course/Commitment/WorkBlock
   records mirror into `iterra.store` so siblings can resolve `courseId`,
   read the plan, and attach sessions/cards/grades against real entities.
   Store writes are incremental — only the entity that changed is put. */

import { useFolio } from '../store';
import { addDaysISO, clamp, diffDaysISO, todayISO } from './utils';
import type { Commitment, Course, Term, WorkBlock } from './types';
import type { ProposedBlock } from './schedule';

declare const window: any;

const APP = 'syllabus';
const COURSE_KEY = 'syllabus:course:';
const DAY_MS = 24 * 60 * 60 * 1000;

// ── entity builders (pure — contract-tested) ─────────────────────────────────

export function termEntity(t: Term) {
  return {
    type: 'term',
    id: t.id,
    title: t.name,
    url: '/apps/syllabus/',
    data: { startDate: t.startDate, endDate: t.endDate, timezone: t.timezone },
  };
}

/** Gradebook categories the registrar actually knows: commitment weight
 *  totals by type — e.g. { exam: 50, assignment: 30 }. Omitted when the
 *  course carries no weighted commitments. */
export function courseCategories(
  c: Course,
  commitments: Record<string, Commitment>,
): Record<string, number> | undefined {
  const w: Record<string, number> = {};
  for (const k of Object.values(commitments)) {
    if (k.courseId !== c.id || k.status === 'dropped' || !k.weight) continue;
    w[k.type] = (w[k.type] ?? 0) + k.weight;
  }
  return Object.keys(w).length ? w : undefined;
}

export function courseEntity(c: Course, categories?: Record<string, number>) {
  return {
    type: 'course',
    id: c.id,
    title: c.name,
    course: c.code,
    url: '/apps/syllabus/',
    data: {
      code: c.code,
      termId: c.termId,
      color: c.color,
      instructor: c.instructor,
      targetGrade: c.targetGrade,
      archived: c.archived || undefined,
      categories,
    },
  };
}

export function commitmentEntity(c: Commitment, code?: string) {
  return {
    type: 'commitment',
    id: c.id,
    courseId: `${COURSE_KEY}${c.courseId}`,
    course: code,
    title: c.title,
    sub: c.type,
    url: `/apps/syllabus/?commitment=${encodeURIComponent(c.id)}`,
    data: {
      type: c.type,
      dueAt: c.dueAt,
      weight: c.weight,
      status: c.status,
      estimatedMinutes: c.estimatedMinutes,
      loggedMinutes: c.loggedMinutes,
      grade: c.grade,
      pinned: c.pinned || undefined,
    },
  };
}

export function blockEntity(b: WorkBlock, c?: Commitment, code?: string) {
  return {
    type: 'block',
    id: b.id,
    courseId: c ? `${COURSE_KEY}${c.courseId}` : undefined,
    course: code,
    title: b.label || c?.title || 'a block',
    url: `/apps/syllabus/?block=${encodeURIComponent(b.id)}`,
    data: {
      commitmentId: b.commitmentId,
      plannedDate: b.plannedDate,
      plannedStart: b.plannedStart,
      plannedMinutes: b.plannedMinutes,
      actualMinutes: b.actualMinutes,
      state: b.state,
      phase: b.phase,
      score: b.score,
    },
  };
}

// ── canonical-store mirror ───────────────────────────────────────────────────

// key -> serialized entity, so each subscribe pass writes only real changes
let lastMirror: Record<string, string> | null = null;
let seenCourses: Set<string> | null = null;
// commitment id -> prior state, for transition events (same pattern as the
// ambient layer's lastBlockStates in lib/iterra.ts)
let lastCommitState: Record<string, { status: string; dueSoon: boolean }> | null = null;

function isDueSoon(c: Commitment, now: number): boolean {
  if (c.status !== 'open' || typeof c.dueAt !== 'string') return false;
  const delta = new Date(c.dueAt).getTime() - now;
  return delta >= 0 && delta <= DAY_MS;
}

function putEntity(e: Record<string, unknown>) {
  const it = window.iterra;
  void Promise.resolve(it.store.put({ app: APP, ...e }))
    .then((r: any) => {
      if (!r?.ok) console.warn('iterra store.put rejected:', r?.error ?? r);
    })
    .catch(() => {});
}

function removeEntity(key: string) {
  const it = window.iterra;
  try {
    void Promise.resolve(it.store.remove?.(key)).catch(() => {});
  } catch {
    /* removal is best-effort */
  }
}

function emitEvent(type: string, payload: Record<string, unknown>) {
  const it = window.iterra;
  try {
    it.events?.emit?.(type, { app: APP, ...payload });
  } catch {
    /* journal is best-effort */
  }
}

/** Full diff pass over the folio. Baseline (first booted pass) mirrors every
 *  entity but emits no events; later passes put changed entities, remove
 *  deleted keys, and emit transition events. Mirror writes run inside the
 *  store's subscribe path — a throw must never reach the app's own set(). */
export function mirrorFolio() {
  try {
    mirrorFolioInner();
  } catch (e) {
    console.warn('iterra mirror failed:', e);
  }
}

function mirrorFolioInner() {
  const it = window.iterra;
  if (!it?.store?.put) return;
  const s = useFolio.getState();
  if (!s.booted) return;

  const now = Date.now();
  const next: Record<string, string> = {};

  for (const t of Object.values(s.terms)) {
    const e = termEntity(t);
    next[`${APP}:term:${e.id}`] = JSON.stringify(e);
  }
  for (const c of Object.values(s.courses)) {
    const e = courseEntity(c, courseCategories(c, s.commitments));
    next[`${APP}:course:${e.id}`] = JSON.stringify(e);
  }
  for (const c of Object.values(s.commitments)) {
    const e = commitmentEntity(c, s.courses[c.courseId]?.code);
    next[`${APP}:commitment:${e.id}`] = JSON.stringify(e);
  }
  for (const b of Object.values(s.blocks)) {
    const c = s.commitments[b.commitmentId];
    const e = blockEntity(b, c, c ? s.courses[c.courseId]?.code : undefined);
    next[`${APP}:block:${e.id}`] = JSON.stringify(e);
  }

  const baseline = lastMirror === null;
  for (const [key, json] of Object.entries(next)) {
    if (lastMirror && lastMirror[key] === json) continue;
    putEntity(JSON.parse(json));
  }
  if (lastMirror) {
    for (const key of Object.keys(lastMirror)) {
      if (!(key in next)) removeEntity(key);
    }
  }
  lastMirror = next;

  if (!baseline && lastCommitState) {
    for (const c of Object.values(s.courses)) {
      if (!seenCourses!.has(c.id)) {
        emitEvent('course.registered', {
          courseId: `${COURSE_KEY}${c.id}`,
          course: c.code,
          title: c.name,
          url: '/apps/syllabus/',
        });
      }
    }
    for (const c of Object.values(s.commitments)) {
      const prior = lastCommitState[c.id];
      if (!prior) continue; // filed after baseline — not a transition
      const dueSoon = isDueSoon(c, now);
      const code = s.courses[c.courseId]?.code;
      if (!prior.dueSoon && dueSoon) {
        emitEvent('assignment.due', {
          commitmentId: c.id,
          courseId: `${COURSE_KEY}${c.courseId}`,
          course: code,
          title: c.title,
          dueAt: c.dueAt,
          url: `/apps/syllabus/?commitment=${encodeURIComponent(c.id)}`,
        });
      }
      if (prior.status !== c.status && (c.status === 'done' || (c.status as string) === 'completed')) {
        emitEvent('assignment.completed', {
          commitmentId: c.id,
          courseId: `${COURSE_KEY}${c.courseId}`,
          course: code,
          title: c.title,
          url: `/apps/syllabus/?commitment=${encodeURIComponent(c.id)}`,
        });
      }
    }
  }

  seenCourses = new Set(Object.keys(s.courses));
  const states: typeof lastCommitState = {};
  for (const c of Object.values(s.commitments)) {
    states[c.id] = { status: c.status, dueSoon: isDueSoon(c, now) };
  }
  lastCommitState = states;
}

// ── workflow E — study-plan.request ─────────────────────────────────────────

const stripIntakeParam = (id?: string) => {
  try {
    const u = new URL(window.location.href);
    if (id && u.searchParams.get('intake') !== id) return;
    if (!u.searchParams.has('intake')) return;
    u.searchParams.delete('intake');
    window.history.replaceState({}, '', u.toString());
  } catch {
    /* cosmetic only */
  }
};

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

const entityMinutes = (e: any): number => {
  const d = e?.data ?? {};
  const v = d.minutes ?? d.actualMinutes ?? d.durationMin ?? d.loggedMinutes;
  return typeof v === 'number' && v > 0 ? v : 0;
};

const isWeakEntity = (e: any): boolean => {
  const d = e?.data ?? {};
  return (
    d.weak === true ||
    d.status === 'diverged' ||
    d.result === 'diverged' ||
    d.outcome === 'diverged' ||
    d.verdict === 'diverged' ||
    d.flag === 'weak'
  );
};

const topicOf = (e: any): string | null => {
  const t = e?.topic ?? e?.data?.topic ?? e?.title ?? e?.data?.title;
  return typeof t === 'string' && t.trim() ? t.trim() : null;
};

const hhmm = (minutes: number): string => {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const parseHHMM = (v: string): number => {
  const [h, m] = String(v || '18:00').split(':').map(Number);
  return (Number.isFinite(h) ? h : 18) * 60 + (Number.isFinite(m) ? m : 0);
};

/** Build a cross-app study plan for a course: due flashcards pace the days,
 *  weak proof topics get one block each, timer history sizes the blocks.
 *  Blocks are written through acceptProposals so they land as real slips —
 *  dedup, ordering, and the 'plan generated' stir all come free. */
export async function studyPlan(rec: any): Promise<{ url: string | null }> {
  const it = window.iterra;
  if (!it?.store?.list) return { url: null };
  const s = useFolio.getState();
  const p = rec?.payload ?? rec?.entity?.data ?? {};

  // courseId arrives as a canonical key ('syllabus:course:<id>'); accept a
  // bare local id or a display code too — senders aren't required to know
  // our internal key shape beyond the canonical one.
  const rawKey = String(p.courseId ?? '');
  const localId = rawKey.startsWith(COURSE_KEY) ? rawKey.slice(COURSE_KEY.length) : rawKey;
  const course =
    s.courses[localId] ??
    Object.values(s.courses).find(
      (c) => p.course && String(c.code).toLowerCase() === String(p.course).toLowerCase(),
    );
  if (!course) return { url: null };
  const courseKey = `${COURSE_KEY}${course.id}`;
  const today = todayISO();

  const listSafe = (f: Record<string, string>): Promise<any[]> =>
    it.store.list(f).then((r: any) => r ?? []).catch(() => []);

  const [cards, proofs, sessions] = await Promise.all([
    listSafe({ app: 'flashcards', type: 'card', courseId: courseKey }),
    listSafe({ app: 'proof', courseId: courseKey }),
    listSafe({ app: 'timer', type: 'session', courseId: courseKey }),
  ]);

  const now = Date.now();
  const dueCards = cards.filter((e: any) => {
    const d = e?.data?.dueAt ?? e?.data?.due ?? e?.dueAt;
    return d && new Date(d).getTime() <= now;
  });

  // weak topics = flagged proof attempts/problems, most-flagged first
  const topicCounts = new Map<string, number>();
  for (const e of proofs) {
    if (e.type !== 'attempt' && e.type !== 'problem') continue;
    if (!isWeakEntity(e)) continue;
    const t = topicOf(e);
    if (t) topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
  }
  const weakTopics = [...topicCounts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);

  // typical session length = median logged minutes, clamped into a sane block
  const size = clamp(
    Math.round(median(sessions.map(entityMinutes).filter(Boolean)) || 45),
    20,
    60,
  );

  // anchor: the exam this plan is for — explicit, else nearest upcoming
  // exam/quiz, else the course's next open commitment, else file one.
  const examId = p.examId
    ? String(p.examId).replace(/^syllabus:commitment:/, '')
    : null;
  const open = Object.values(s.commitments)
    .filter((c) => c.courseId === course.id && c.status === 'open')
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  let anchor: Commitment | undefined =
    (examId ? s.commitments[examId] : undefined) ??
    open.find((c) => c.type === 'exam' || c.type === 'quiz') ??
    open[0];

  const term = s.terms[course.termId];
  const fallbackTarget =
    term?.endDate && term.endDate >= today ? term.endDate : addDaysISO(today, 7);
  const target = anchor?.dueAt ? anchor.dueAt.slice(0, 10) : fallbackTarget;

  if (!anchor) {
    anchor = s.addCommitment({
      courseId: course.id,
      type: 'custom',
      title: `${course.code || course.name} — study plan`,
      detail: 'Filed by study-plan.request so plan blocks have somewhere to live.',
      dueAt: `${target}T23:59:00`,
      weight: 0,
      estimatedMinutes: 0,
      pinned: false,
    });
  }

  const days = clamp(diffDaysISO(today, target) + 1, 1, 14);
  const cardsPerDay = dueCards.length ? clamp(Math.ceil(dueCards.length / 40), 1, 3) : 0;
  const topicQueue = weakTopics.slice(0, days);

  const proposals: ProposedBlock[] = [];
  for (let d = 0; d < days; d++) {
    const date = addDaysISO(today, d);
    let cursor = parseHHMM(s.settings.studyWindowStart);
    for (let i = 0; i < cardsPerDay; i++) {
      proposals.push({
        commitmentId: anchor.id,
        plannedDate: date,
        plannedStart: hhmm(cursor),
        plannedMinutes: size,
        phase: 'review',
        label: 'review due cards',
        reasons: [`study plan — ${dueCards.length} cards due before ${target}`],
        score: 0,
        late: false,
      });
      cursor += size + 10;
    }
    const topic = topicQueue[d];
    if (topic) {
      proposals.push({
        commitmentId: anchor.id,
        plannedDate: date,
        plannedStart: hhmm(cursor),
        plannedMinutes: size,
        phase: 'practice',
        label: `weak topic: ${topic}`,
        reasons: [`study plan — flagged weak/diverged in proof`],
        score: 0,
        late: false,
      });
    }
  }

  stripIntakeParam(rec?.id);
  const made = proposals.length ? s.acceptProposals(proposals) : [];
  return { url: made.length ? '/apps/syllabus/' : null };
}

// ── registration ─────────────────────────────────────────────────────────────

let registered = false;

export function registerAdapter() {
  if (registered) return;
  const it = window.iterra;
  if (!it?.adapter) return;
  registered = true;

  useFolio.subscribe(mirrorFolio);
  mirrorFolio();

  it.adapter({
    name: APP,
    title: 'Syllabus',
    intakes: {
      'study-plan.request': (rec: any) => studyPlan(rec),
      /* {title, courseId?, course?, date?, minutes?, phase?, label?} → book a
         slip on the folio: the rhythm app files routine sessions here so
         'what's planned' and 'what was done' live on the same ledger.
         Hangs on a found-or-filed commitment in the resolved course. */
      'block.plan': (rec: any) => {
        const s = useFolio.getState();
        const p = rec?.payload ?? {};
        const rawKey = String(p.courseId ?? '');
        const localId = rawKey.startsWith(COURSE_KEY) ? rawKey.slice(COURSE_KEY.length) : rawKey;
        const course =
          s.courses[localId] ??
          Object.values(s.courses).find(
            (c) => p.course && String(c.code).toLowerCase() === String(p.course).toLowerCase(),
          );
        if (!course) return { url: null };
        const title = typeof p.title === 'string' && p.title.trim()
          ? p.title.trim()
          : `${course.code || course.name} — planned session`;
        const date = /^\d{4}-\d{2}-\d{2}$/.test(String(p.date || '')) ? String(p.date) : todayISO();
        const minutes = clamp(Math.round(Number(p.minutes) || 45), 15, 240);
        const open = Object.values(s.commitments)
          .filter((c) => c.courseId === course.id && c.status === 'open')
          .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
        const anchor = open[0] ?? s.addCommitment({
          courseId: course.id,
          type: 'custom',
          title: `${course.code || course.name} — planned work`,
          detail: 'Filed by block.plan so incoming slips have somewhere to live.',
          dueAt: `${date}T23:59:00`,
          weight: 0,
          estimatedMinutes: 0,
          pinned: false,
        });
        const phase = ['work', 'review', 'practice', 'draft', 'outline', 'read', 'check'].includes(p.phase)
          ? p.phase
          : 'work';
        const made = s.acceptProposals([{
          commitmentId: anchor.id,
          plannedDate: date,
          plannedStart: /^\d{2}:\d{2}$/.test(String(p.start || '')) ? String(p.start) : '16:00',
          plannedMinutes: minutes,
          phase,
          label: p.label || title,
          reasons: ['planned from another app'],
          score: 0,
          late: false,
        }]);
        return { url: made.length ? '/apps/syllabus/' : null };
      },
    },
    wake: () => mirrorFolio(),
  });

  /* register marks nudge the folio: a 'routine.logged' event for a bound
     course bumps the next open commitment's loggedMinutes + lastWorkedAt —
     effort recorded on the register shows up on the folio's own ledger. */
  it.events?.on?.('routine.logged', (rec: any) => {
    try {
      const p = rec?.payload ?? {};
      const s = useFolio.getState();
      const rawKey = String(p.courseId ?? '');
      const localId = rawKey.startsWith(COURSE_KEY) ? rawKey.slice(COURSE_KEY.length) : rawKey;
      const course =
        (localId && s.courses[localId]) ||
        Object.values(s.courses).find(
          (c) => p.course && String(c.code).toLowerCase() === String(p.course).toLowerCase(),
        );
      if (!course) return;
      const open = Object.values(s.commitments)
        .filter((c) => c.courseId === course.id && c.status === 'open')
        .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
      if (!open[0]) return;
      const mins = Math.max(1, Math.round(Number(p.minutes) || 10));
      s.updateCommitment(open[0].id, {
        loggedMinutes: (open[0].loggedMinutes || 0) + mins,
        lastWorkedAt: new Date().toISOString(),
      });
    } catch { /* a nudge is best-effort — never throw into the event bus */ }
  });
}

registerAdapter();
