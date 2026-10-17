/* ── iterra adapter — syllabus's door to the canonical store ──────────────────
   Contract: docs/ADAPTER.md. This file is the ONLY place `iterra.adapter()`
   is called; the commons/index/feed ambient layer stays in lib/iterra.ts.

   Syllabus is the course-registry owner: its Term/Course/Commitment/WorkBlock
   records mirror into `iterra.store` so siblings can resolve `courseId`,
   read the plan, and attach sessions/cards/grades against real entities.
   Store writes are incremental — only the entity that changed is put. */

import { useFolio } from '../store';
import { execCommand } from '../../../integration/commands';
import { addDaysISO, clamp, diffDaysISO, dueDateISO, isoAtTime, todayISO } from './utils';
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
    // integrated mode carries the query inside the hash: #/p/syllabus?intake=<id>
    const h = window.location.hash;
    const qi = h.indexOf('?');
    if (qi === -1) return;
    const q = new URLSearchParams(h.slice(qi + 1));
    if (id && q.get('intake') !== id) return;
    if (!q.has('intake')) return;
    q.delete('intake');
    const rest = q.toString();
    window.location.hash = h.slice(0, qi) + (rest ? '?' + rest : '');
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
/* a boot drain can claim an intake before the folio's store has booted —
   waiting is honest, fake-delivering isn't: throw on timeout so the hub
   releases the claim and a later drain delivers for real. */
function whenBooted(timeoutMs = 9000): Promise<void> {
  const t0 = Date.now();
  return new Promise((res, rej) => {
    const tick = () => {
      if (useFolio.getState().booted) return res();
      if (Date.now() - t0 > timeoutMs) return rej(new Error('syllabus folio not booted'));
      setTimeout(tick, 120);
    };
    tick();
  });
}

export async function studyPlan(rec: any): Promise<{ url: string | null; toast?: string }> {
  const it = window.iterra;
  if (!it?.store?.list) return { url: null };
  await whenBooted();
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
  if (!course) {
    const asked = p.course || localId;
    return {
      url: null,
      toast: asked ? `No course “${asked}” in Planning — add it first` : 'study plan needs a course',
    };
  }
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
  const target = anchor?.dueAt ? dueDateISO(anchor.dueAt) : fallbackTarget;

  if (!anchor) {
    anchor = s.addCommitment({
      courseId: course.id,
      type: 'custom',
      title: `${course.code || course.name} — study plan`,
      detail: 'Filed by study-plan.request so plan blocks have somewhere to live.',
      dueAt: isoAtTime(target, '23:59'),
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

  /* the plan also lands on the register: a 'study <anchor>' routine scoped
     to the exam date, same cadence the blocks propose — so the habit loop
     sees it, not just the folio. Best-effort; a dead rhythm never fails
     the plan itself. */
  try {
    if (made.length && it.send) {
      it.send({
        to: 'rhythm',
        action: 'routine.plan',
        payload: {
          name: `study ${anchor.title}`,
          course: course.code || course.name,
          courseId: courseKey,
          dueAt: isoAtTime(target, '23:59'),
          perWeek: Math.min(7, Math.max(1, Math.round(days))),
          minutes: size,
          unit: 'min',
        },
      }).catch(() => {});
    }
  } catch { /* scaffold is best-effort */ }

  return {
    url: made.length ? '/apps/syllabus/' : null,
    toast: made.length
      ? undefined
      : 'Nothing to plan — no due cards or weak topics found for that course',
  };
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
      'block.plan': async (rec: any) => {
        await whenBooted();
        const s = useFolio.getState();
        const p = rec?.payload ?? {};
        const rawKey = String(p.courseId ?? '');
        const localId = rawKey.startsWith(COURSE_KEY) ? rawKey.slice(COURSE_KEY.length) : rawKey;
        const course =
          s.courses[localId] ??
          Object.values(s.courses).find(
            (c) => p.course && String(c.code).toLowerCase() === String(p.course).toLowerCase(),
          );
        /* {url:null} alone reads as silent success-with-nothing — say why
           through the rail so a send to a missing course isn't a dead end */
        if (!course) {
          const asked = p.course || localId;
          return {
            url: null,
            toast: asked ? `No course “${asked}” in Planning — add it first` : 'block.plan needs a course',
          };
        }
        const title = typeof p.title === 'string' && p.title.trim()
          ? p.title.trim()
          : `${course.code || course.name} — planned session`;
        const date = /^\d{4}-\d{2}-\d{2}$/.test(String(p.date || '')) ? String(p.date) : todayISO();
        const minutes = clamp(Math.round(Number(p.minutes) || 45), 15, 240);
        const start = /^\d{2}:\d{2}$/.test(String(p.start || '')) ? String(p.start) : '16:00';
        const phase = ['work', 'review', 'practice', 'draft', 'outline', 'read', 'check'].includes(p.phase)
          ? p.phase
          : undefined;

        /* a send carrying study material (an entity on the record, or an
           explicit materialRef) takes the typed command path: materialRef/
           Url/Title land on the block and a scheduledFor edge links them,
           so the slip's Start opens the deck/note/problem — the generic
           slip path can't carry provenance. Non-material entities (a
           course, a commitment) fall through to the plain slip. */
        const MATERIAL = new Set(['deck', 'card', 'note', 'problem', 'attempt', 'quiz', 'material', 'source']);
        const matRef =
          typeof p.materialRef === 'string' && p.materialRef ? p.materialRef
          : typeof p.material === 'string' && p.material ? p.material
          : rec?.entity && MATERIAL.has(rec.entity.type)
            ? rec.entity.key || `${rec.entity.app}:${rec.entity.type}:${rec.entity.id}`
            : null;
        if (matRef) {
          /* drains can invoke one intake through racing claims — a second
             run finds the same material+day slip and reuses it rather than
             stacking a copy (the dedup acceptProposals gives the generic
             path) */
          const existing = Object.values(s.blocks).find(
            (b) =>
              b.materialRef === matRef &&
              b.plannedDate === date &&
              b.state !== 'done' &&
              b.state !== 'missed',
          );
          if (existing) {
            return { url: `/apps/syllabus/?block=${encodeURIComponent(existing.id)}` };
          }
          const res = await execCommand('scheduleReviewBlock', {
            materialRef: matRef,
            title: typeof p.title === 'string' && p.title.trim() ? p.title.trim() : (p.label || undefined),
            plannedDate: date,
            plannedStart: start,
            plannedMinutes: minutes,
            phase,
            courseId: rawKey || undefined,
            course: p.course || course.code,
            idempotencyKey: rec?.id ? `block.plan:${rec.id}` : undefined,
          }).catch(() => null);
          if (res?.ok) return { url: res.url };
          /* material path failed (missing/unresolvable) — the generic slip
             still answers the ask; note the attachment didn't land */
          const made = bookGeneric();
          return {
            url: made.length ? `/apps/syllabus/?block=${encodeURIComponent(made[0].id)}` : null,
            toast: `Block planned — couldn't attach the material (${res?.error || 'not found'})`,
          };
        }

        const made = bookGeneric();
        return {
          url: made.length ? `/apps/syllabus/?block=${encodeURIComponent(made[0].id)}` : null,
          toast: made.length ? undefined : 'An identical slip is already on the folio for that slot',
        };

        function bookGeneric() {
          const open = Object.values(s.commitments)
            .filter((c) => c.courseId === course.id && c.status === 'open')
            .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
          const anchor = open[0] ?? s.addCommitment({
            courseId: course.id,
            type: 'custom',
            title: `${course.code || course.name} — planned work`,
            detail: 'Filed by block.plan so incoming slips have somewhere to live.',
            dueAt: isoAtTime(date, '23:59'),
            weight: 0,
            estimatedMinutes: 0,
            pinned: false,
          });
          return s.acceptProposals([{
            commitmentId: anchor.id,
            plannedDate: date,
            plannedStart: start,
            plannedMinutes: minutes,
            phase: phase || 'work',
            label: p.label || title,
            reasons: ['planned from another app'],
            score: 0,
            late: false,
          }]);
        }
      },
      /* {blockId} → stamp the slip done where it sits — Today's 'Mark done'
         completes off-clock work without a timer session. navigate:false:
         the point is staying on the surface that asked. completeBlock is
         idempotent, so a redelivered record returns 'already done'. */
      'block.done': async (rec: any) => {
        await whenBooted();
        const s = useFolio.getState();
        const p = (rec?.payload ?? {}) as Record<string, any>;
        const bid = typeof p.blockId === 'string' ? p.blockId
          : (rec?.entity?.type === 'block' && typeof rec.entity.id === 'string' ? rec.entity.id : '');
        const b = bid ? s.blocks[bid] : undefined;
        if (!b) return { url: null, toast: 'that slip no longer exists' };
        const deep = `/apps/syllabus/?block=${encodeURIComponent(b.id)}`;
        if (b.state === 'done') return { url: deep, navigate: false, toast: `${b.label || 'Slip'} — already stamped` };
        if (b.state === 'missed' || b.state === 'deferred') {
          return { url: deep, navigate: false, toast: `${b.label || 'Slip'} is ${b.state} — reopen it on the folio first` };
        }
        const title = b.label || s.commitments[b.commitmentId]?.title || 'Slip';
        s.completeBlock(b.id);
        return { url: deep, navigate: false, toast: `${title} — stamped done` };
      },
      /* {blockId, date?} → push the slip — defaults to tomorrow, stays
         'planned' on the new date (deferBlock with toDate reschedules
         rather than marking 'deferred'). Today's 'Push to tomorrow' —
         a slip you can't start shouldn't have to go 'missed'. */
      'block.defer': async (rec: any) => {
        await whenBooted();
        const s = useFolio.getState();
        const p = (rec?.payload ?? {}) as Record<string, any>;
        const bid = typeof p.blockId === 'string' ? p.blockId
          : (rec?.entity?.type === 'block' && typeof rec.entity.id === 'string' ? rec.entity.id : '');
        const b = bid ? s.blocks[bid] : undefined;
        if (!b) return { url: null, toast: 'that slip no longer exists' };
        const deep = `/apps/syllabus/?block=${encodeURIComponent(b.id)}`;
        if (b.state === 'done') return { url: deep, navigate: false, toast: `${b.label || 'Slip'} is already stamped` };
        const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
        const to = typeof p.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.date)
          ? p.date
          : tomorrow;
        s.deferBlock(b.id, 'pushed from Today', to as any);
        const title = b.label || s.commitments[b.commitmentId]?.title || 'Slip';
        return { url: deep, navigate: false, toast: `${title} — pushed to ${to === tomorrow ? 'tomorrow' : to}` };
      },
    },
    wake: () => mirrorFolio(),
  });
}

registerAdapter();
