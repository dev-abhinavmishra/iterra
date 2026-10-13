// ── Consistency bands ────────────────────────────────────────────────────────
// Bands, not streaks. A band describes where a routine stands and suggests a
// repair; nothing resets, nothing is lost. Four states per the spec plus
// 'building' for routines too new or too mixed to have a verdict.

import type { DayException, Entry, Experiment, ISODate, Routine } from './types';
import { completedWeekStarts, inRange, routineWeek } from './register';
import { dateOfInstant, diffDaysISO, todayISO } from './dates';

export type Band = 'established' | 'recovery' | 'paused' | 'experimenting' | 'building';

export interface BandInfo {
  band: Band;
  /** Weeks examined for the verdict. */
  weeksJudged: number;
  /** Consecutive hit weeks at the tail. */
  hitsAtTail: number;
  /** Consecutive missed weeks at the tail. */
  missesAtTail: number;
  /** Suggest the minimum version when in recovery and one exists. */
  suggestMinimum: boolean;
}

export function bandFor(
  routine: Routine,
  entries: Record<string, Entry>,
  exceptions: Record<string, DayException>,
  experiments: Record<string, Experiment>,
  today: ISODate = todayISO(),
  weekStartsOn: 0 | 1 = 1,
): BandInfo {
  if (routine.status === 'paused') {
    return { band: 'paused', weeksJudged: 0, hitsAtTail: 0, missesAtTail: 0, suggestMinimum: false };
  }

  const activeExperiment = Object.values(experiments).some(
    (e) =>
      e.routineId === routine.id &&
      e.status === 'active' &&
      inRange(today, e.startDate, e.endDate),
  );
  if (activeExperiment) {
    return { band: 'experimenting', weeksJudged: 0, hitsAtTail: 0, missesAtTail: 0, suggestMinimum: false };
  }

  // Judge completed weeks only — the current week is still being written.
  const starts = completedWeekStarts(routine, today, weekStartsOn);
  const judged = starts
    .map((w) => routineWeek(routine, w, entries, exceptions, today, weekStartsOn))
    .filter((w) => !w.exempt);

  let hitsAtTail = 0;
  for (let i = judged.length - 1; i >= 0; i--) {
    if (judged[i].hit) hitsAtTail++;
    else break;
  }
  let missesAtTail = 0;
  for (let i = judged.length - 1; i >= 0; i--) {
    if (!judged[i].hit) missesAtTail++;
    else break;
  }

  const base = { weeksJudged: judged.length, hitsAtTail, missesAtTail };

  // 'Established' — repeatedly meeting the chosen weekly target.
  if (judged.length >= 3 && hitsAtTail >= 3) {
    return { ...base, band: 'established', suggestMinimum: false };
  }

  // 'In recovery' — recent performance dropped: two or more consecutive missed
  // weeks, and either the routine once performed better or it is old enough
  // that the pattern itself is the finding.
  const ageDays = diffDaysISO(today, dateOfInstant(routine.createdAt));
  const onceHit = judged.some((w) => w.hit);
  if (judged.length >= 2 && missesAtTail >= 2 && (onceHit || ageDays >= 21)) {
    return { ...base, band: 'recovery', suggestMinimum: !!routine.minimum };
  }

  return { ...base, band: 'building', suggestMinimum: false };
}

export const BAND_LABEL: Record<Band, string> = {
  established: 'ESTABLISHED',
  recovery: 'IN RECOVERY',
  paused: 'PAUSED',
  experimenting: 'EXPERIMENTING',
  building: 'BUILDING',
};

export const BAND_NOTE: Record<Band, string> = {
  established: 'Meeting the chosen weekly target, week after week.',
  recovery: 'Recent weeks dropped. Consider running the minimum version for a while.',
  paused: 'Intentionally suspended. History is untouched.',
  experimenting: 'A behavior change is under test — judging is suspended.',
  building: 'Still gathering the weeks needed for a verdict.',
};
