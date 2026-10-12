/* ── iterra adapter — gradestack's door to the canonical store ────────────────
   Contract: docs/ADAPTER.md. This file is the ONLY place `iterra.adapter()`
   is called; the commons/index/feed ambient layer stays in lib/iterra.ts.

   The mark book mirrors each assessment (Test) and each scored sheet (Scan)
   into `iterra.store` so siblings can read real grades. courseId resolution
   is lazy — tests only carry a free-text courseName, and syllabus may publish
   the registry after gradestack has already mirrored — so unresolved names
   retry on every pass instead of fabricating a key. */

import { useEffect, useState } from 'react';
import { useStore } from '../store';
import type { Scan, Test } from '../store';

declare const window: any;

const APP = 'gradestack';

// ── courseId resolution (byCode, lazily retried — never fabricated) ──────────

const courseKeyCache = new Map<string, string | null>();
let mirrorScheduled = false;

const normName = (v?: string): string => (v ?? '').trim().toLowerCase();

function scheduleMirror() {
  if (mirrorScheduled) return;
  mirrorScheduled = true;
  setTimeout(() => {
    mirrorScheduled = false;
    mirrorGradebook();
  }, 0);
}

/** Kick a byCode lookup for a courseName; returns the cached key or null.
 *  Unresolved names retry on the next mirror pass. */
export function courseKeyFor(courseName?: string): string | null {
  const it = window.iterra;
  const norm = normName(courseName);
  if (!norm || !it?.courses?.byCode) return null;
  if (courseKeyCache.has(norm)) return courseKeyCache.get(norm) ?? null;
  courseKeyCache.set(norm, null);
  void Promise.resolve(it.courses.byCode(courseName))
    .then((e: any) => {
      if (e?.key) {
        courseKeyCache.set(norm, e.key);
        scheduleMirror();
      } else {
        courseKeyCache.delete(norm);
      }
    })
    .catch(() => courseKeyCache.delete(norm));
  return null;
}

// ── entity builders (pure — contract-tested) ─────────────────────────────────

export function assessmentEntity(t: Test, scanCount: number, courseId?: string | null) {
  return {
    type: 'assessment',
    id: t.id,
    courseId: courseId ?? undefined,
    course: t.courseName?.trim() || undefined,
    title: t.name,
    sub: `${scanCount} marked`,
    url: `/apps/gradestack/?assessment=${encodeURIComponent(t.id)}`,
    data: {
      numQuestions: t.numQuestions,
      format: t.format,
      date: t.date,
      sections: t.sections?.length,
      instructorName: t.instructorName,
      courseName: t.courseName,
      weights: t.weights,
    },
  };
}

export function gradeEntity(scan: Scan, test: Test | undefined, courseId?: string | null) {
  return {
    type: 'grade',
    id: scan.id,
    courseId: courseId ?? undefined,
    course: test?.courseName?.trim() || undefined,
    title: test?.name ?? 'a sheet',
    sub: scan.studentName || undefined,
    url: `/apps/gradestack/scan?testId=${encodeURIComponent(scan.testId)}&scanId=${encodeURIComponent(scan.id)}`,
    data: {
      score: scan.rawScore,
      max: scan.maxScore,
      pct: scan.percentage,
      grade: scan.grade,
      needsReview: scan.needsReview || undefined,
      enteredAt: typeof scan.createdAt === 'number' ? new Date(scan.createdAt).toISOString() : undefined,
      testId: scan.testId,
      batchName: scan.batchName,
    },
  };
}

// ── canonical-store mirror ───────────────────────────────────────────────────

let lastMirror: Record<string, string> | null = null;
let lastScans: Record<string, { needsReview: boolean; pct: number | null }> | null = null;

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

const trusted = (x: Scan): boolean => x.percentage != null && !x.needsReview;

/** Full diff pass over the mark book. Baseline mirrors every entity but
 *  emits no events; later passes put changed entities, remove deleted keys,
 *  and emit grade.entered for sheets whose grade just became trusted.
 *  Mirror writes run inside the store's subscribe path — a throw must never
 *  reach the app's own set(). */
export function mirrorGradebook() {
  try {
    mirrorGradebookInner();
  } catch (e) {
    console.warn('iterra mirror failed:', e);
  }
}

function mirrorGradebookInner() {
  const it = window.iterra;
  if (!it?.store?.put) return;
  const { tests, scans } = useStore.getState();
  if (!useStore.persist?.hasHydrated?.() && !tests.length && !scans.length) return;

  const testById = new Map<string, Test>(tests.map((t) => [t.id, t]));
  const keyFor = (t?: Test) => (t?.courseName ? courseKeyFor(t.courseName) : null);
  const next: Record<string, string> = {};

  for (const t of tests) {
    const e = assessmentEntity(t, scans.filter((x) => x.testId === t.id).length, keyFor(t));
    next[`${APP}:assessment:${e.id}`] = JSON.stringify(e);
  }
  for (const x of scans) {
    const e = gradeEntity(x, testById.get(x.testId), keyFor(testById.get(x.testId)));
    next[`${APP}:grade:${e.id}`] = JSON.stringify(e);
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

  // grade.entered — a grade counts as "entered" when its score becomes
  // trusted: a fresh sheet marked clean, or a flagged sheet whose review
  // just cleared. Bulk-synced ids stay quiet like the ambient stirs.
  if (!baseline && lastScans) {
    const merged = useStore.getState()._mergedIds;
    for (const x of scans) {
      const prior = lastScans[x.id];
      const isNew = !prior;
      const cleared = prior ? prior.needsReview && trusted(x) : false;
      const entered = trusted(x) && (isNew ? !merged?.has(x.id) : cleared);
      if (!entered) continue;
      const t = testById.get(x.testId);
      emitEvent('grade.entered', {
        gradeId: x.id,
        courseId: keyFor(t) ?? undefined,
        course: t?.courseName || undefined,
        score: x.percentage,
        text: `grade entered: ${t?.name ?? 'a sheet'}`,
        url: `/apps/gradestack/scan?testId=${encodeURIComponent(x.testId)}&scanId=${encodeURIComponent(x.id)}`,
      });
    }
  }

  const states: typeof lastScans = {};
  for (const x of scans) states[x.id] = { needsReview: x.needsReview, pct: x.percentage };
  lastScans = states;
}

// ── workflow F — weights.import ─────────────────────────────────────────────

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

/** Carry syllabus's category weights onto the matching gradestack course:
 *  read the registry entity, then stamp `weights` on every test whose
 *  courseName matches that course. Quiet {url:null} when there's nothing
 *  real to apply. */
export async function weightsImport(rec: any): Promise<{ url: string | null }> {
  const it = window.iterra;
  if (!it?.store?.get) return { url: null };
  const p = rec?.payload ?? {};

  let ent: any = null;
  if (p.courseId) ent = await Promise.resolve(it.store.get(String(p.courseId))).catch(() => null);
  if (!ent && p.course && it.courses?.byCode) {
    ent = await Promise.resolve(it.courses.byCode(String(p.course))).catch(() => null);
  }
  const w = ent?.data?.categories ?? ent?.data?.weights;
  if (!w || typeof w !== 'object' || Array.isArray(w) || !Object.keys(w).length) {
    stripIntakeParam(rec?.id);
    return { url: null };
  }

  const names = new Set(
    [p.course, ent?.data?.code, ent?.course, ent?.title]
      .filter((v: any) => typeof v === 'string' && v.trim())
      .map((v: string) => v.trim().toLowerCase()),
  );
  const targets = useStore
    .getState()
    .tests.filter((t) => t.courseName && names.has(normName(t.courseName)));

  stripIntakeParam(rec?.id);
  if (!targets.length) return { url: null };
  await Promise.all(
    targets.map((t) =>
      useStore
        .getState()
        .updateTest(t.id, { weights: { ...(w as Record<string, number>) } })
        .catch(() => {}),
    ),
  );
  return { url: `/apps/gradestack/?assessment=${encodeURIComponent(targets[0].id)}` };
}

// ── workflow D tail — logged minutes beside a grade ─────────────────────────

const entityMinutes = (e: any): number => {
  const d = e?.data ?? {};
  const v = d.minutes ?? d.actualMinutes ?? d.durationMin ?? d.loggedMinutes;
  return typeof v === 'number' && v > 0 ? v : 0;
};

/** Total timer minutes logged against this test's course, or null while
 *  unresolved/zero — renders subdued microcopy only when there's a number.
 *  Refreshes on store writes and a slow tick (the registry may land late). */
export function useCourseLoggedMinutes(courseName?: string): number | null {
  const [minutes, setMinutes] = useState<number | null>(null);
  useEffect(() => {
    const it = window.iterra;
    if (!it?.store?.list || !normName(courseName)) {
      setMinutes(null);
      return;
    }
    let alive = true;
    let inflight = false;
    const pull = async () => {
      if (inflight) return;
      inflight = true;
      try {
        const key = courseKeyFor(courseName);
        if (!key) {
          if (alive) setMinutes(null);
          return;
        }
        const rows: any[] = await Promise.resolve(
          it.store.list({ type: 'session', courseId: key }),
        ).catch(() => []);
        const sum = rows.reduce((acc, e) => acc + entityMinutes(e), 0);
        if (alive) setMinutes(sum > 0 ? sum : null);
      } finally {
        inflight = false;
      }
    };
    void pull();
    let unsub: (() => void) | undefined;
    try {
      unsub = it.store.subscribe?.(() => void pull());
    } catch {
      /* subscribe is best-effort */
    }
    const iv = setInterval(() => void pull(), 30_000);
    return () => {
      alive = false;
      unsub?.();
      clearInterval(iv);
    };
  }, [courseName]);
  return minutes;
}

/** '2h 05m' / '45m' — the mark book's microcopy shape. */
export function fmtLoggedMinutes(min: number): string {
  const m = Math.round(min);
  if (m >= 60) return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
  return `${m}m`;
}

// ── workflow A tail — due cards beside an assessment row ────────────────────

/** Cards due for this course — the cardfile mirrors each card with
 *  data.dueAt = 0 while due and null once mastered, so a numeric dueAt at or
 *  under now is the due check. Matches the resolved registry key first and
 *  falls back to the course label for decks bound before resolution.
 *  Returns null until the store answers so rows only render a real count. */
export function useDueCardCount(courseName?: string): number | null {
  const [due, setDue] = useState<number | null>(null);
  useEffect(() => {
    const it = window.iterra;
    const want = normName(courseName);
    if (!it?.store?.list || !want) {
      setDue(null);
      return;
    }
    let alive = true;
    let inflight = false;
    const pull = async () => {
      if (inflight) return;
      inflight = true;
      try {
        const key = courseKeyFor(courseName);
        const rows: any[] = await Promise.resolve(
          it.store.list({ app: 'flashcards', type: 'card' }),
        ).catch(() => []);
        const now = Date.now();
        const n = rows.filter((e) => {
          const d = e?.data?.dueAt;
          if (typeof d !== 'number' || d > now) return false;
          return (key ? e.courseId === key : false) || normName(e?.course) === want;
        }).length;
        if (alive) setDue(n);
      } finally {
        inflight = false;
      }
    };
    void pull();
    let unsub: (() => void) | undefined;
    try {
      unsub = it.store.subscribe?.(() => void pull());
    } catch {
      /* subscribe is best-effort */
    }
    const iv = setInterval(() => void pull(), 30_000);
    return () => {
      alive = false;
      unsub?.();
      clearInterval(iv);
    };
  }, [courseName]);
  return due;
}

/** Where "from the folio →" lands: the shell's course dossier when the
 *  courseName resolves to a real registry course, else the folio's door. */
export async function folioUrlFor(courseName?: string): Promise<string> {
  const it = window.iterra;
  try {
    if (it?.courses?.byCode && normName(courseName)) {
      const ent = await Promise.resolve(it.courses.byCode(courseName));
      const code = ent?.data?.code ?? ent?.course;
      if (code) return `#/c/${encodeURIComponent(String(code))}`;
    }
  } catch {
    /* resolution is best-effort */
  }
  return '/apps/syllabus/';
}

// ── registration ─────────────────────────────────────────────────────────────

let registered = false;

export function registerAdapter() {
  if (registered) return;
  const it = window.iterra;
  if (!it?.adapter) return;
  registered = true;

  useStore.subscribe(mirrorGradebook);
  mirrorGradebook();
  useStore.persist?.onFinishHydration?.(mirrorGradebook);

  it.adapter({
    name: APP,
    title: 'GradeStack',
    intakes: {
      'weights.import': (rec: any) => weightsImport(rec),
    },
    wake: () => mirrorGradebook(),
  });
}

registerAdapter();
