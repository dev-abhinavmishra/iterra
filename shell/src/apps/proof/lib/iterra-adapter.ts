/* iterra adapter — Proof (workflow C).
   Publishes {type:'problem'} per problem and {type:'attempt'} per attempt
   into the canonical store, handles the 'step.append' intake (appends a
   reference step to the current open attempt), and on each filed error
   record emits 'attempt.diverged', re-puts the attempt with
   data.diverged, and sends a retest card to flashcards
   ('problem.retest'). Everything is guarded — standalone keeps working. */
import { useWorkbench } from '../store';
import type { Attempt, ErrorRecord, Problem } from './types';
import { docToText } from './doc';
import { misconceptionCard } from './links';

type Hub = {
  ready?: Promise<unknown>;
  store?: {
    put(e: Record<string, unknown>): Promise<unknown>;
    list(q?: Record<string, unknown>): Promise<Array<{ key?: string; id?: string; type?: string; data?: { status?: string } }>>;
    remove(k: string): Promise<unknown>;
  };
  courses?: {
    resolve(ref: unknown): Promise<{ key?: string; id?: string; course?: string; title?: string; data?: { code?: string } } | null>;
    list?(): Promise<Array<{ key?: string; course?: string; title?: string; data?: { code?: string } }>>;
  };
  events?: { emit(t: string, p: Record<string, unknown>): unknown };
  send?(o: Record<string, unknown>): Promise<unknown>;
  adapter?(o: Record<string, unknown>): void;
  intakes?: { drain?(app: string, done?: () => void): void };
};
const hub = (): Hub | undefined => (typeof window !== 'undefined' ? (window as { iterra?: Hub }).iterra : undefined);

/* ── pure builders (contract-tested) ──────────────────────────────── */

export interface BoundCourse { courseId?: string; course?: string; name?: string }

export function problemEntity(p: Problem, bound: BoundCourse = {}) {
  return {
    app: 'proof',
    type: 'problem',
    id: p.id,
    courseId: bound.courseId,
    course: bound.course,
    topic: p.topic || undefined,
    title: docToText(p.promptDoc, 80) || 'untitled',
    sub: p.topic || undefined,
    url: `/apps/proof/?problem=${encodeURIComponent(p.id)}`,
    createdAt: p.createdAt,
    data: { topic: p.topic },
  };
}

export function attemptEntity(a: Attempt, p: Problem | undefined, errs: ErrorRecord[], bound: BoundCourse = {}) {
  const cats = Array.from(new Set(errs.map((e) => e.customLabel || e.category).filter((c) => c && c !== 'none')));
  const latest = errs.length ? errs[errs.length - 1] : undefined;
  return {
    app: 'proof',
    type: 'attempt',
    id: a.id,
    courseId: bound.courseId,
    course: bound.course,
    topic: p?.topic || undefined,
    title: `attempt — ${p?.topic || 'untitled'}`,
    sub: a.result || (a.submittedAt ? 'submitted' : 'open'),
    url: `/apps/proof/?attempt=${encodeURIComponent(a.id)}`,
    createdAt: a.startedAt,
    data: {
      problemId: a.problemId,
      diverged: errs.length > 0,
      weak: cats,
      error: latest ? (latest.customLabel || latest.category) : null,
      result: a.result,
    },
  };
}

export function divergedEvent(err: ErrorRecord, p: Problem | undefined, bound: BoundCourse = {}) {
  return {
    attemptId: err.attemptId,
    problemId: err.problemId,
    topic: p?.topic || undefined,
    courseId: bound.courseId,
    course: bound.course,
    text: `attempt diverged — ${p?.topic || 'untitled'}`,
    url: `/apps/proof/?attempt=${encodeURIComponent(err.attemptId)}`,
  };
}

/* retest card from what the filing actually recorded — honest: no repair
   cue or a 'none' filing means there's nothing to test, so no card */
export function retestCard(err: ErrorRecord, a: Attempt | undefined, p: Problem | undefined): { q: string; a: string; ex: string } | null {
  if (!err || err.category === 'none') return null;
  const card = misconceptionCard({ category: err.customLabel || err.category, repairCue: err.repairCue, problem: p });
  if (!card?.q?.trim() || !card?.a?.trim()) return null;
  const idx = err.divergentSteps?.[0];
  const stepText = typeof idx === 'number' ? a?.work?.[idx]?.text : undefined;
  const label = (stepText && docToText(stepText, 60)) || err.customLabel || err.category;
  return { q: card.q, a: card.a, ex: `diverged at ${label}` };
}

export function stepRefText(ent: { key?: string; title?: string } | undefined): string {
  const title = String(ent?.title || ent?.key || 'reference').slice(0, 140);
  return `ref · ${title}${ent?.key ? ` (${ent.key})` : ''}`;
}

/* deterministic signature — same trick as the index publisher: skip puts
   whose payload didn't move */
export function entitySig(e: Record<string, unknown>): string {
  return JSON.stringify([e.app, e.type, e.id, e.courseId, e.course, e.topic,
    e.title, e.sub, e.url, e.data, e.createdAt]);
}

/* ── hub plumbing ─────────────────────────────────────────────────── */

const courseCache = new Map<string, BoundCourse>();
async function boundCourse(code?: string, courseId?: string): Promise<BoundCourse> {
  const it = hub();
  if (!it?.courses) return { courseId, course: code };
  const cacheKey = `${courseId || ''}|${code || ''}`;
  const hit = courseCache.get(cacheKey);
  if (hit) return hit;
  let bound: BoundCourse = { courseId, course: code };
  try {
    /* try the id first — but a LOCAL (c_*) id never resolves canonically, so
       fall through to the code when id lookup misses rather than binding a
       made-up ref */
    let c = null;
    if (courseId) c = await it.courses.resolve({ courseId });
    if (!c && code) c = await it.courses.resolve(code);
    if (c) {
      bound = {
        courseId: c.key ?? courseId,
        course: c.data?.code ?? c.course ?? c.id ?? code,
        name: typeof c.title === 'string' ? c.title : undefined,
      };
    }
  } catch { /* keep what we were given */ }
  courseCache.set(cacheKey, bound);
  ensureLocalCourse(bound);
  return bound;
}

/* problems bind to CANONICAL course keys (syllabus:course:<id>) while every
   read path looks up the local registry — so a bound course must exist in
   s.courses under its canonical key or chips/pickups resolve to nothing.
   Mirror in the registry entry without disturbing user-managed courses. */
function ensureLocalCourse(bound: BoundCourse) {
  const key = bound.courseId;
  if (!key || !bound.course) return;
  const s = useWorkbench.getState();
  const existing = s.courses?.[key];
  const name = bound.name || String(bound.course);
  if (existing && existing.code === bound.course && existing.name === name) return;
  useWorkbench.setState((cur) => ({
    courses: {
      ...cur.courses,
      [key]: existing
        ? { ...existing, code: String(bound.course), name }
        : { id: key, code: String(bound.course), name, color: 'slate', createdAt: new Date().toISOString(), archived: false },
    },
  }));
}

/* pull the whole canonical registry at prime/wake so pickers (ImportView,
   ProblemEditor) offer real courses without needing an intake first */
let coursesSyncing = false;
async function syncCourses() {
  const it = hub();
  if (!it?.courses?.list || coursesSyncing) return;
  coursesSyncing = true;
  try {
    const rows = await it.courses.list();
    for (const e of rows || []) {
      const code = String(e?.data?.code ?? e?.course ?? e?.title ?? '').trim();
      if (!e?.key || !code) continue;
      ensureLocalCourse({ courseId: e.key, course: code, name: typeof e.title === 'string' ? e.title : undefined });
    }
  } catch { /* registry stays as-is */ } finally {
    coursesSyncing = false;
  }
}

const shadow = new Map<string, string>();
async function putIfChanged(ent: Record<string, unknown>) {
  const key = `${ent.app}:${ent.type}:${ent.id}`;
  const sig = entitySig(ent);
  if (shadow.get(key) === sig) return;
  shadow.set(key, sig);
  try { await hub()?.store?.put(ent); } catch { /* best-effort mirror */ }
}

const seenErrors = new Set<string>();
let errorsSeeded = false;
let mirroring = false;
let mirrorQueued = false;

function errsFor(errs: Record<string, ErrorRecord>, attemptId: string): ErrorRecord[] {
  return Object.values(errs)
    .filter((e) => e.attemptId === attemptId)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

async function mirror() {
  const it = hub();
  if (!it?.store) return;
  const s = useWorkbench.getState();
  if (!s.booted) return;
  if (mirroring) { mirrorQueued = true; return; }
  mirroring = true;
  try {
    const live = new Set<string>();
    const problems = Object.values(s.problems || {});
    const attempts = Object.values(s.attempts || {});
    const errors = s.errors || {};

    const boundByProblem = new Map<string, BoundCourse>();
    const boundFor = async (p?: Problem) => {
      if (!p) return {};
      const code = p.courseId ? s.courses?.[p.courseId]?.code : undefined;
      const cacheKey = p.courseId || code || '';
      /* pass the id through — a canonical binding must resolve even when the
         local mirror hasn't run yet; boundCourse falls back to code for
         local c_* ids */
      if (!boundByProblem.has(cacheKey)) boundByProblem.set(cacheKey, await boundCourse(code, p.courseId));
      return boundByProblem.get(cacheKey)!;
    };

    for (const p of problems) {
      if (p.archived) continue;
      live.add(`proof:problem:${p.id}`);
      await putIfChanged(problemEntity(p, await boundFor(p)) as unknown as Record<string, unknown>);
    }
    for (const a of attempts) {
      const p = s.problems?.[a.problemId];
      live.add(`proof:attempt:${a.id}`);
      const errs = errsFor(errors, a.id);
      await putIfChanged(attemptEntity(a, p, errs, await boundFor(p)) as unknown as Record<string, unknown>);
    }

    for (const key of Array.from(shadow.keys())) {
      if (live.has(key)) continue;
      shadow.delete(key);
      try { await it.store.remove?.(key); } catch { /* keep going */ }
    }

    /* divergence watch — fileError lands as a new record in errors; the
       first pass only seeds so history doesn't re-fire */
    for (const rec of Object.values(errors)) {
      if (!errorsSeeded || seenErrors.has(rec.id)) { seenErrors.add(rec.id); continue; }
      seenErrors.add(rec.id);
      await onDivergence(rec, s);
    }
    errorsSeeded = true;
  } finally {
    mirroring = false;
    if (mirrorQueued) { mirrorQueued = false; void mirror(); }
  }
}

async function onDivergence(err: ErrorRecord, s = useWorkbench.getState()) {
  const it = hub();
  if (!it) return;
  const a = s.attempts?.[err.attemptId];
  const p = s.problems?.[err.problemId];
  const code = p?.courseId ? s.courses?.[p.courseId]?.code : undefined;
  const bound = await boundCourse(code);
  try { it.events?.emit('attempt.diverged', divergedEvent(err, p, bound)); } catch { /* best effort */ }
  if (a) {
    try { await it.store?.put(attemptEntity(a, p, errsFor(s.errors || {}, a.id), bound) as unknown as Record<string, unknown>); } catch { /* mirror stays put-deduped anyway */ }
  }
  const card = retestCard(err, a, p);
  if (card && it.send) {
    try {
      await it.send({
        to: 'flashcards',
        action: 'problem.retest',
        entity: { app: 'proof', type: 'attempt', id: err.attemptId, courseId: bound.courseId },
        payload: {
          deckTitle: 'Retest · ' + (p?.topic || 'attempt'),
          course: bound.course,
          courseId: bound.courseId,
          cards: [card],
        },
      });
    } catch { /* send is best-effort — the intake queue retries at the edge */ }
  }
}

/* intake drains can race the workbench's own boot — a queued send landing
   on a cold frame must wait for booted state, not fake-deliver. Throw on
   timeout so the hub's intake retry releases the claim and re-drains. */
function whenBooted(timeoutMs = 9000): Promise<void> {
  const t0 = Date.now();
  return new Promise((res, rej) => {
    const tick = () => {
      if (useWorkbench.getState().booted) return res();
      if (Date.now() - t0 > timeoutMs) return rej(new Error('proof workbench not booted'));
      setTimeout(tick, 120);
    };
    tick();
  });
}

/* step.append: fold the sent entity into the current open attempt as a
   reference step. No open attempt is NOT a failure — the durable contract
   says pending means pending: {retry:true} keeps the record queued (the hub
   re-drains a few times on its own; listen() below pokes a fresh drain the
   moment an attempt actually opens) instead of silently losing the step. */
async function onStepAppend(rec: { entity?: { key?: string; title?: string } }) {
  await whenBooted();
  const s = useWorkbench.getState();
  if (!s.booted) return null;
  const ent = rec?.entity;
  if (!ent) return null;
  const open = Object.values(s.attempts || {})
    .filter((a) => !a.submittedAt)
    .sort((x, y) => String(y.startedAt).localeCompare(String(x.startedAt)))[0];
  if (!open) return { retry: true };
  const text = stepRefText(ent);
  /* the hub may hand one intake record to several racing drains — the ref
     text is deterministic, so a duplicate run finds the step already
     there instead of stacking copies (same pattern margin uses for its
     intake-derived note id) */
  if (!(open.work || []).some((w) => w?.text === text)) {
    s.addStep(open.id, { text });
  }
  return { url: `/apps/proof/?attempt=${encodeURIComponent(open.id)}` };
}

async function prime() {
  const it = hub();
  if (!it?.store?.list) return;
  try {
    const rows = await it.store.list({ app: 'proof' });
    for (const e of rows || []) {
      if (!e?.key) continue;
      shadow.set(e.key, entitySig(e as unknown as Record<string, unknown>));
    }
  } catch { /* shadow starts empty — first mirror publishes everything */ }
  void syncCourses();
}

let listening = false;
let hadOpenAttempt = false;
function listen() {
  if (listening) return;
  listening = true;
  useWorkbench.subscribe(() => {
    void mirror();
    /* step.append can sit pending while no attempt is open (the hub's own
       re-drain budget is finite). When the first open attempt appears,
       poke one drain so a queued reference step lands instead of waiting
       for the next send to wake the queue. */
    const open = Object.values(useWorkbench.getState().attempts || {}).some((a) => !a.submittedAt);
    if (open && !hadOpenAttempt) {
      try { hub()?.intakes?.drain?.('proof', () => {}); } catch { /* best effort */ }
    }
    hadOpenAttempt = open;
  });
}

export function registerAdapter() {
  const it = hub();
  if (!it?.adapter) return;
  it.adapter({
    name: 'proof',
    title: 'Proof',
    summary: () => {
      const s = useWorkbench.getState();
      if (!s.booted) return null;
      return { due: s.dueReviews().length, attempts: Object.keys(s.attempts || {}).length };
    },
    intakes: {
      'step.append': onStepAppend,
      /* {topic?, prompt?|title?, course?, courseId?, difficulty?, tags?,
         source?} → a real Problem on the bench: a margin note, a syllabus
         weak topic, or a dossier click files the next rep here. */
      'problem.create': async (rec: any) => {
        await whenBooted();
        const s = useWorkbench.getState();
        if (!s.booted) return null;
        const p = rec?.payload ?? {};
        const prompt = String(p.prompt || p.title || rec?.entity?.title || '').trim();
        /* a prompt-less create can never succeed on retry — deliver it with
           a toast so the rail surfaces *why* nothing appeared instead of a
           silent {ok:false} that reads as success-with-no-url */
        if (!prompt) return { toast: 'problem.create needs a prompt — nothing filed' };
        /* a palette send carries the course on the entity, not the payload —
           its binding stands in when the payload doesn't spell one; a bare
           course entity IS the course (its key is canonical) */
        const entCourseId = rec?.entity?.type === 'course'
          ? rec.entity.courseId ?? rec.entity.key ?? rec.entity.id
          : rec?.entity?.courseId;
        const bound = await boundCourse(p.course ?? rec?.entity?.course, p.courseId ?? entCourseId);
        const diff = Number(p.difficulty);
        /* deterministic id from the intake record — the hub can invoke one
           delivery through several racing drains; a re-run upserts the same
           problem instead of filing a second copy (margin's intake-<id>
           note does the same) */
        const problem = s.addProblem({
          id: typeof rec?.id === 'string' && rec.id ? `p_${rec.id}` : undefined,
          courseId: bound.courseId,
          topic: String(p.topic || bound.course || 'from the terrain').trim(),
          promptDoc: prompt,
          answerSpec: { kind: 'open' },
          workedSolutionDoc: '',
          hints: [],
          tags: Array.isArray(p.tags) ? p.tags.map(String) : (p.source ? [String(p.source)] : ['terrain']),
          difficulty: (diff >= 1 && diff <= 5 ? Math.round(diff) : 2) as 1 | 2 | 3 | 4 | 5,
          source: typeof p.source === 'string' ? p.source : 'iterra',
          attachments: [],
        });
        /* provenance: the filed problem was derived FROM the sent entity —
           dossiers/search read links, not the 'source' tag */
        const srcKey = typeof rec?.entity?.key === 'string' ? rec.entity.key : null;
        if (srcKey) {
          try { await (window as any).iterra?.links?.add(`proof:problem:${problem.id}`, srcKey, 'derivedFrom'); } catch { /* best effort */ }
        }
        return { url: `/apps/proof/?problem=${encodeURIComponent(problem.id)}` };
      },
    },
    wake: () => { courseCache.clear(); void syncCourses(); void mirror(); },
  });
  listen();
  void (async () => { await prime(); await mirror(); })();
}

registerAdapter();
