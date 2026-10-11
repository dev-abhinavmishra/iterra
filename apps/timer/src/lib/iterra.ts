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
