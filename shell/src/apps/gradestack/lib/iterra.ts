// ── iterra bridge ────────────────────────────────────────────────────────────
// Announces the mark book to the terrain and publishes a small live summary
// for the shell's Today rail. Read-only: the bridge never mutates the store.
// Contract: docs/WIRING.md §3 — summary shape { lastMark, assessments }.

import { useEffect, useState } from 'react';
import { useStore } from '../store';

/* window.iterra declared in shell/src/hub.ts */

interface GradeSummary {
  lastMark: { name: string; pct: number | null } | null;
  assessments: number;
}

function summary(): GradeSummary | null {
  if (!useStore.persist?.hasHydrated?.()) return null;

  const { tests, scans } = useStore.getState();

  // The mark most recently touched = the test owning the newest scan.
  let lastMark: GradeSummary['lastMark'] = null;
  if (scans.length) {
    const newest = scans.reduce((a, b) => ((b.createdAt || 0) > (a.createdAt || 0) ? b : a));
    const test = tests.find((t) => t.id === newest.testId);
    if (test) {
      const its = scans.filter((s) => s.testId === test.id);
      const pct = its.length
        ? Math.round((its.reduce((sum, s) => sum + s.percentage, 0) / its.length) * 10) / 10
        : null;
      lastMark = { name: test.name, pct };
    }
  }

  return { lastMark, assessments: tests.length };
}

// ── shared.activeCourse reader (the course chip in the sidebar) ──────────────
// Commons/index writes live in the ambient layer below — this is read-side.

const COURSE_FRESH_MS = 5 * 60_000;

/** Ambient stir emit for UI call sites — same best-effort contract as the
 *  ambient layer's own feeds. Honest fields only; course is the caller's
 *  real course value or undefined. */
export const feed = (text: string, url?: string, course?: string) => {
  try {
    (window as any).iterra?.feed?.({ text, url, course });
  } catch {
    /* feed is best-effort */
  }
};

/**
 * The syllabus' shared.activeCourse while it's fresh — shown as a small
 * context line in the sidebar. Re-reads on doc writes and a slow tick.
 */
export function useActiveCourse(): { code: string; name: string } | null {
  const [course, setCourse] = useState<{ code: string; name: string } | null>(null);
  useEffect(() => {
    const doc = window.iterra?.doc?.('shared');
    if (!doc) return;
    const check = () => {
      const f = (doc.get() as any)?.activeCourse;
      setCourse(f && f.v && Date.now() - (f.at ?? 0) < COURSE_FRESH_MS ? f.v : null);
    };
    check();
    const unsub = doc.subscribe(check);
    const iv = setInterval(check, 30_000);
    return () => { unsub?.(); clearInterval(iv); };
  }, []);
  return course;
}

export function wireIterra() {
  const iterra = window.iterra;
  if (!iterra) return;
  iterra.register('gradestack', {
    title: 'GradeStack',
    summary,
  });
}

wireIterra();

/* ambient layer — commons markbook, assessment index, feed on scans (§7) */
(() => {
  const it: any = (window as any).iterra;
  if (!it) return;
  const shared = it.doc('shared');
  const indexDoc = it.doc('index.gradestack');
  let lastCommons = '', lastEntities = '', lastIds: Set<string> | null = null, lastTestIds: Set<string> | null = null;
  const publish = () => {
    try {
      publishInner();
    } catch (e) {
      console.warn("iterra ambient publish failed:", e);
    }
  };
  const publishInner = () => {
    const { tests, scans } = useStore.getState() as any;
    const newest = scans.length ? [...scans].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] : null;
    const test = newest ? tests.find((t: any) => t.id === newest.testId) : null;
    const its = test ? scans.filter((x: any) => x.testId === test.id) : [];
    // scored = sheets with a trusted grade on file (percentage recorded and
    // not flagged needsReview); total = every sheet on that assessment.
    const scored = its.filter((x: any) => x.percentage != null && !x.needsReview).length;
    const v = test ? { assessment: test.name, scored, total: its.length } : null;
    const j = JSON.stringify(v);
    if (j !== lastCommons) { lastCommons = j; shared.setField('markbook', { v, by: 'gradestack', at: Date.now() }); }
    const entities = tests.slice(0, 50).map((t: any) => ({
      t: 'assessment', id: t.id, title: t.name,
      sub: `${scans.filter((x: any) => x.testId === t.id).length} marked`,
      // Test.courseName is the mark book's own course field — real linkage
      course: typeof t.courseName === 'string' && t.courseName.trim() ? t.courseName : undefined,
      url: `/apps/gradestack/?assessment=${t.id}`, at: t.createdAt || Date.now(),
    }));
    const ej = JSON.stringify(entities);
    if (ej !== lastEntities) { lastEntities = ej; indexDoc.set({ entities }); }
    const mergedIds = (useStore.getState() as any)._mergedIds as Set<string> | null;
    const ids = new Set<string>(scans.map((x: any) => String(x.id)));
    if (lastIds) for (const x of scans) if (!lastIds.has(x.id) && !mergedIds?.has(x.id)) {
      const t = tests.find((tt: any) => tt.id === x.testId);
      // A flagged sheet's grade is provisional — 'marked' would announce a
      // score that isn't trusted yet; it earns its marked-stir on review.
      const text = x.needsReview
        ? `scanned: ${t?.name ?? 'a sheet'} — needs review`
        : `marked: ${t?.name ?? 'a sheet'}${x.percentage != null ? ` · ${Math.round(x.percentage)}%` : ''}`;
      it.feed({ text, url: '/apps/gradestack/', course: t?.courseName || undefined });
    }
    lastIds = ids;
    const tids = new Set<string>(tests.map((t: any) => String(t.id)));
    if (lastTestIds) for (const t of tests) if (!lastTestIds.has(String(t.id)) && !mergedIds?.has(t.id)) {
      it.feed({ text: `assessment built: ${t?.name ?? 'a sheet'}`, url: `/apps/gradestack/?assessment=${t.id}`, course: t?.courseName || undefined });
    }
    lastTestIds = tids;
  };
  useStore.subscribe(publish);
  if (useStore.persist?.hasHydrated?.()) publish();
  else useStore.persist?.onFinishHydration?.(publish);
})();

import './iterra-adapter';
