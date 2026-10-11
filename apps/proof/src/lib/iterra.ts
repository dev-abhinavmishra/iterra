// ── iterra environment bridge ────────────────────────────────────────────────
// Announces Proof to the shell and publishes a small summary for the Today
// rail (~every 3s, JSON-diffed by the hub). No-ops standalone.

import { useWorkbench } from '../store';
import { docToText } from './doc';

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

  /* commons: shared.session (the live practice session) + index.proof
     (palette entities) + feed stirrings — WIRING §7. Everything publishes
     through one store subscription, JSON-diffed so idle ticks don't rewrite. */
  const shared = iterra.doc?.('shared');
  const indexDoc = iterra.doc?.('index.proof');
  if (shared || indexDoc) {
    let lastSessionJson = '';
    let lastIndexJson = '';
    let seeded = false;
    const ACTIVE = '\u0000'; // sentinel — an active session's completedAt is undefined
    const seen = new Map<string, string>(); // session id → completedAt | ACTIVE
    const publish = () => {
      const s = useWorkbench.getState();
      if (!s.booted) return;
      const sessions = Object.values(s.sessions || {});
      /* latest-started session wins — an abandoned !completedAt session must
         not shadow a live one (Object.values order is insertion order) */
      const active = sessions
        .filter((x) => !x.completedAt)
        .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))[0];

      /* feed: session started / completed — seed silently on first pass.
         Deduped against the feed doc itself: a second mounted proof frame's
         store re-syncs via the persist storage event and would feed the same
         transition again — same text within 15s is one event, not two. */
      if (iterra.feed) {
        const feedOnce = (text: string) => {
          const items = iterra.doc?.('feed')?.get()?.items;
          if (
            Array.isArray(items) &&
            items.some(
              (it: any) =>
                it?.app === 'proof' && it?.text === text &&
                Number.isFinite(it?.at) && Date.now() - it.at < 15000,
            )
          )
            return;
          iterra.feed({ text, url: '/apps/proof/' });
        };
        for (const sess of sessions) {
          const had = seen.get(sess.id);
          const label = sess.intent ?? sess.rules?.topics?.[0] ?? 'practice';
          if (seeded && had === undefined) feedOnce(`session started · ${label}`);
          else if (seeded && had === ACTIVE && sess.completedAt) feedOnce(`session completed · ${label}`);
          seen.set(sess.id, sess.completedAt ?? ACTIVE);
        }
        seeded = true;
      }

      if (shared) {
        const stamp = {
          v: active
            ? {
                topic: active.intent ?? active.rules?.topics?.[0] ?? null,
                minutes: active.rules?.minutes ?? null,
                active: true,
              }
            : null,
          by: 'proof',
          at: Date.now(),
        };
        const json = JSON.stringify(stamp.v);
        if (json !== lastSessionJson) {
          lastSessionJson = json;
          shared.setField('session', stamp);
        }
      }

      if (indexDoc) {
        const entities: any[] = [];
        if (active)
          entities.push({
            t: 'session',
            id: active.id,
            title: active.intent ?? 'practice session',
            sub: active.rules?.minutes != null ? `${active.rules.minutes}m` : undefined,
            url: '/apps/proof/',
            at: Date.now(),
          });
        for (const p of Object.values(s.problems || {})
          .filter((p) => !p.archived)
          .slice(0, Math.max(0, 50 - entities.length))) {
          const courseCode = p.courseId ? (s.courses as any)?.[p.courseId]?.code : undefined;
          entities.push({
            t: 'problem',
            id: p.id,
            title: (typeof p.promptDoc === 'string' ? docToText(p.promptDoc, 80) : '') || 'untitled',
            sub: p.topic,
            course: courseCode,
            topic: p.topic || undefined,
            url: `/apps/proof/?problem=${encodeURIComponent(p.id)}`,
            at: Date.now(),
          });
        }
        const json = JSON.stringify(entities.map((e) => [e.t, e.id, e.title, e.sub, e.url]));
        if (json !== lastIndexJson) {
          lastIndexJson = json;
          indexDoc.set({ entities });
        }
      }
    };
    const publishSafe = () => {
      try {
        publish();
      } catch (e) {
        /* ambient code must never break its host app — a throwing
           subscriber would poison the store's notify loop */
        console.warn('iterra ambient publish failed:', e);
      }
    };
    useWorkbench.subscribe(publishSafe);
    publishSafe();
  }
}

wireIterra();
