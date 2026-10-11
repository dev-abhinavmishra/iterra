// ── iterra environment bridge ────────────────────────────────────────────────
// Announces Proof to the shell and publishes a small summary for the Today
// rail (~every 3s, JSON-diffed by the hub). No-ops standalone.

import { useWorkbench } from '../store';

declare global {
  interface Window {
    iterra?: any;
  }
}

export function wireIterra() {
  const iterra = window.iterra;
  if (!iterra) return;
  iterra.register('proof', {
    title: 'Proof',
    summary: () => {
      const s = useWorkbench.getState();
      if (!s.booted) return null;
      return {
        due: s.dueReviews().length,
        attempts: Object.keys(s.attempts || {}).length,
      };
    },
  });
}

wireIterra();

/* ambient layer — commons session, problem index, feed on attempts (§7) */
(() => {
  const it: any = (window as any).iterra;
  if (!it) return;
  const shared = it.doc('shared');
  const indexDoc = it.doc('index.proof');
  let lastCommons = '', lastEntities = '', lastIds: Set<string> | null = null;
  const publish = () => {
    const s: any = useWorkbench.getState();
    if (!s.booted) return;
    const active = Object.values(s.sessions || {}).find((x: any) => x && !x.endedAt) as any;
    const v = active ? { active: true, topic: active.topic, minutes: active.minutes } : null;
    const j = JSON.stringify(v);
    if (j !== lastCommons) { lastCommons = j; shared.setField('session', { v, by: 'proof', at: Date.now() }); }
    const entities = (Object.values(s.problems || {}) as any[]).slice(0, 50).map((pb) => ({
      t: 'problem', id: pb.id, title: pb.title || pb.name || `problem ${pb.id}`,
      sub: pb.topic || pb.course, course: pb.course, topic: pb.topic,
      url: `/apps/proof/?problem=${pb.id}`, at: Date.now(),
    }));
    const ej = JSON.stringify(entities.map((e: any) => ({ ...e, at: 0 })));
    if (ej !== lastEntities) { lastEntities = ej; indexDoc.set({ entities }); }
    const ids = new Set<string>(Object.keys(s.attempts || {}));
    if (lastIds) for (const id of ids) if (!lastIds.has(id)) {
      const a = s.attempts[id];
      const pb = a ? (s.problems as any)[a.problemId] : null;
      it.feed({ text: `attempt filed${pb?.title ? `: ${pb.title}` : ''}`, url: '/apps/proof/' });
    }
    lastIds = ids;
  };
  useWorkbench.subscribe(publish);
  if (useWorkbench.persist.hasHydrated()) publish();
  else useWorkbench.persist.onFinishHydration(publish);
})();
