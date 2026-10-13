/* iterra bridge — the instruments report the live session the way they
   already publish it (document.title "MM:SS — label") plus today's ledger
   minutes. No countdown internals touched. */
import { getSessions } from './stats';
import { BUILT_INS, loadRoutines } from './routines';

function runningFromTitle(): { label: string; endsInMin: number } | null {
  const m = document.title.match(/^(\d{1,3}):(\d{2})\s—\s(.+)$/);
  if (!m) return null;
  const sec = Number(m[1]) * 60 + Number(m[2]);
  return { label: m[3], endsInMin: Math.max(0, Math.round(sec / 60)) };
}

export function timerSummary() {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const todayMin = Math.round(
    getSessions()
      .filter((s) => s.timestamp >= dayStart.getTime())
      .reduce((n, s) => n + s.duration, 0) / 60,
  );
  return { running: runningFromTitle(), todayMin };
}

export function wireIterra() {
  const iterra = window.iterra;
  if (!iterra) return;
  iterra.register('timer', {
    title: 'Timer',
    summary: timerSummary,
  });
  publishRoutineIndex();
}

/* index.timer — routines + intervals for the shell palette (WIRING §7).
   Re-published by IntervalsView when customs change; JSON-diffed. */
let indexDoc: any;
let lastIndexJson = '';
export function publishRoutineIndex() {
  if (indexDoc === undefined) indexDoc = (window as any).iterra?.doc?.('index.timer') ?? null;
  if (!indexDoc) return;
  const entities = [...BUILT_INS, ...loadRoutines()].slice(0, 50).map((r) => ({
    t: 'routine',
    id: r.id,
    title: r.name,
    // only real fields — Routine has no course today, but a custom one might
    course: (r as { course?: string }).course || undefined,
    // ?routine=<name> intake — dossier rows + palette hits land ON the routine
    url: '/apps/timer/?routine=' + encodeURIComponent(r.name),
    at: Date.now(),
  }));
  const json = JSON.stringify(entities.map((e) => [e.t, e.id, e.title, (e as { course?: string }).course, e.url]));
  if (json === lastIndexJson) return;
  lastIndexJson = json;
  indexDoc.set({ entities });
}

wireIterra();

import './iterra-adapter';
