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

/* ambient layer — commons markbook, assessment index, feed on scans (§7) */
(() => {
  const it: any = (window as any).iterra;
  if (!it) return;
  const shared = it.doc('shared');
  const indexDoc = it.doc('index.gradestack');
  let lastCommons = '', lastEntities = '', lastIds: Set<string> | null = null;
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
    const v = test ? { assessment: test.name, scored: its.length, total: its.length } : null;
    const j = JSON.stringify(v);
    if (j !== lastCommons) { lastCommons = j; shared.setField('markbook', { v, by: 'gradestack', at: Date.now() }); }
    const entities = tests.slice(0, 50).map((t: any) => ({
      t: 'assessment', id: t.id, title: t.name,
      sub: `${scans.filter((x: any) => x.testId === t.id).length} marked`,
      url: `/apps/gradestack/?assessment=${t.id}`, at: t.createdAt || Date.now(),
    }));
    const ej = JSON.stringify(entities);
    if (ej !== lastEntities) { lastEntities = ej; indexDoc.set({ entities }); }
    const ids = new Set<string>(scans.map((x: any) => String(x.id)));
    if (lastIds) for (const x of scans) if (!lastIds.has(x.id)) {
      const t = tests.find((tt: any) => tt.id === x.testId);
      it.feed({ text: `marked: ${t?.name ?? 'a sheet'}${x.percentage != null ? ` · ${Math.round(x.percentage)}%` : ''}`, url: '/apps/gradestack/' });
    }
    lastIds = ids;
  };
  useStore.subscribe(publish);
  if (useStore.persist?.hasHydrated?.()) publish();
  else useStore.persist?.onFinishHydration?.(publish);
})();
