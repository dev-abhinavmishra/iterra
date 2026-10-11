/* iterra bridge — the instruments report the live session the way they
   already publish it (document.title "MM:SS — label") plus today's ledger
   minutes. No countdown internals touched. */
import { getSessions } from './stats';

declare global {
  interface Window {
    iterra?: { register(app: string, opts: { title?: string; summary?: () => unknown }): void };
  }
}

function runningFromTitle(): { label: string; endsInMin: number } | null {
  const m = document.title.match(/^(\d{1,3}):(\d{2})\s—\s(.+)$/);
  if (!m) return null;
  const sec = Number(m[1]) * 60 + Number(m[2]);
  return { label: m[3], endsInMin: Math.max(0, Math.round(sec / 60)) };
}

export function wireIterra() {
  const iterra = window.iterra;
  if (!iterra) return;
  iterra.register('timer', {
    title: 'Timer',
    summary: () => {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const todayMin = Math.round(
        getSessions()
          .filter((s) => s.timestamp >= dayStart.getTime())
          .reduce((n, s) => n + s.duration, 0) / 60,
      );
      return { running: runningFromTitle(), todayMin };
    },
  });
}

wireIterra();

/* ambient layer — commons focus, session index, feed on new sessions (§7) */
(() => {
  const it: any = (window as any).iterra;
  if (!it) return;
  const shared = it.doc('shared');
  const indexDoc = it.doc('index.timer');
  let lastFocus = '', lastEntities = '', lastIds: Set<string> | null = null;
  const publish = () => {
    try {
      publishInner();
    } catch (e) {
      console.warn("iterra ambient publish failed:", e);
    }
  };
  const publishInner = () => {
    const run = runningFromTitle();
    const fv = run ? { running: true, label: run.label, endsInMin: run.endsInMin } : null;
    const fj = JSON.stringify(fv);
    if (fj !== lastFocus) { lastFocus = fj; shared.setField('focus', { v: fv, by: 'timer', at: Date.now() }); }
    const sessions = getSessions();
    const entities = sessions.slice(-50).map((s: any, i: number) => ({
      t: 'session', id: `${s.timestamp}-${i}`, title: s.label || 'session',
      sub: `${Math.round(s.duration / 60)}m`, url: '/apps/timer/', at: s.timestamp,
    })).reverse();
    const ej = JSON.stringify(entities);
    if (ej !== lastEntities) { lastEntities = ej; indexDoc.set({ entities }); }
    const ids = new Set(sessions.map((s: any) => String(s.timestamp)));
    if (lastIds) for (const s of sessions as any[]) {
      if (!lastIds.has(String(s.timestamp))) {
        it.feed({ text: `${Math.round(s.duration / 60)}m on the instruments${s.label ? ` — ${s.label}` : ''}`, url: '/apps/timer/' });
      }
    }
    lastIds = ids;
  };
  setInterval(publish, 3000);
  publish();
})();
