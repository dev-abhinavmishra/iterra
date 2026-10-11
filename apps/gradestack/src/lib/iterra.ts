// ── iterra bridge ────────────────────────────────────────────────────────────
// Announces the mark book to the terrain and publishes a small live summary
// for the shell's Today rail. Read-only: the bridge never mutates the store.
// Contract: docs/WIRING.md §3 — summary shape { lastMark, assessments }.

import { useStore } from '../store';

declare global {
  interface Window {
    iterra?: any;
  }
}

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

export function wireIterra() {
  const iterra = window.iterra;
  if (!iterra) return;
  iterra.register('gradestack', {
    title: 'GradeStack',
    summary,
  });
}

wireIterra();
