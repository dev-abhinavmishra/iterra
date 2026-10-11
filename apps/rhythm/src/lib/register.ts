// ── Register engine ──────────────────────────────────────────────────────────
// Turns routines + entries + exceptions into honest weekly scorecards. The
// rules that make it a register, not a streak counter:
//   • a missed target never erases or resets anything
//   • exceptions exempt days from the denominator — they are marked, never
//     erased or counted as failures
//   • entries on unscheduled days still count (a bonus, never a penalty)
//   • paused intervals are recorded, so paused weeks simply aren't scored

import type {
  DayException,
  Entry,
  ISODate,
  Routine,
} from './types';
import { addDaysISO, dateOfInstant, diffDaysISO, rangeDatesISO, todayISO, weekDatesISO, weekStartISO, weekdayOf } from './dates';

// ── Day state ────────────────────────────────────────────────────────────────

export type DayState =
  | 'full' // met the bar (check done, or amount ≥ perDay)
  | 'partial' // something logged, below the per-day bar
  | 'minimum' // logged via the minimum version — a real mark, smaller bar
  | 'missed' // scheduled, day has passed, nothing logged
  | 'exception' // excused — travel/exam/etc.; outside the ledger's judgment
  | 'paused' // inside a recorded pause interval
  | 'unscheduled' // not one of the routine's weekdays
  | 'future'; // hasn't happened yet (scheduled or not)

export function routineWeekdays(routine: Routine): number[] {
  // Empty weekday list means "any day" — every day is a routine day.
  return routine.weekdays.length ? routine.weekdays : [0, 1, 2, 3, 4, 5, 6];
}

export function isScheduled(routine: Routine, date: ISODate): boolean {
  return routineWeekdays(routine).includes(weekdayOf(date));
}

export function exceptionFor(
  exceptions: Record<string, DayException>,
  routineId: string,
  date: ISODate,
): DayException | undefined {
  return Object.values(exceptions).find(
    (e) => e.date === date && (e.routineId === routineId || e.routineId === 'all'),
  );
}

export function isPausedOn(routine: Routine, date: ISODate): boolean {
  for (const p of routine.pauses ?? []) {
    if (diffDaysISO(date, p.from) >= 0 && (p.to === undefined || diffDaysISO(p.to, date) > 0)) {
      return true;
    }
  }
  return false;
}

export function entriesOn(
  entries: Record<string, Entry>,
  routineId: string,
  date: ISODate,
): Entry[] {
  return Object.values(entries).filter((e) => e.routineId === routineId && e.date === date);
}

export function valueOn(entries: Record<string, Entry>, routineId: string, date: ISODate): number {
  return entriesOn(entries, routineId, date).reduce((s, e) => s + e.value, 0);
}

/** The per-day bar for a 'full' mark on amount-measure routines. */
export function perDayBar(routine: Routine): number {
  if (routine.measure === 'check') return 1;
  if (routine.target.perDay) return routine.target.perDay;
  // No explicit bar: spread the weekly target over scheduled days, min 1.
  return Math.max(1, Math.ceil(routine.target.perWeek / routineWeekdays(routine).length));
}

export function dayState(
  routine: Routine,
  date: ISODate,
  entries: Record<string, Entry>,
  exceptions: Record<string, DayException>,
  today: ISODate = todayISO(),
): DayState {
  const dayEntries = entriesOn(entries, routine.id, date);
  if (dayEntries.length) {
    if (routine.measure === 'check') {
      return dayEntries.some((e) => e.isMinimum) && !dayEntries.some((e) => !e.isMinimum)
        ? 'minimum'
        : 'full';
    }
    const total = dayEntries.reduce((s, e) => s + e.value, 0);
    if (dayEntries.every((e) => e.isMinimum)) return 'minimum';
    return total >= perDayBar(routine) ? 'full' : 'partial';
  }
  if (exceptionFor(exceptions, routine.id, date)) return 'exception';
  if (isPausedOn(routine, date)) return 'paused';
  const future = diffDaysISO(date, today) > 0;
  if (future) return 'future';
  if (!isScheduled(routine, date)) return 'unscheduled';
  // Past/today scheduled day with nothing logged.
  const created = dateOfInstant(routine.createdAt);
  if (diffDaysISO(created, date) > 0) return 'unscheduled'; // before it existed
  return 'missed';
}

// ── Weekly scorecard ─────────────────────────────────────────────────────────

export interface RoutineWeek {
  routineId: string;
  weekStart: ISODate;
  /** Scheduled days that count toward the target (not excepted, not paused,
      not before creation, and for the current week only days up to today). */
  availableDays: number;
  effectiveTarget: number; // weekly target clamped to what's actually possible
  actual: number; // in measure units: days for check, units for amounts
  completedDays: number; // days at 'full' or 'minimum'
  minimumDays: number;
  partialDays: number;
  exceptionDays: number;
  sessions: number; // entry count
  totalValue: number; // sum of entry values (minutes, cards…)
  hit: boolean;
  /** All scheduled days were excepted/paused — excluded from hit-rate. */
  exempt: boolean;
  /** Week isn't over — hit is provisional. */
  inProgress: boolean;
}

export function routineWeek(
  routine: Routine,
  weekStart: ISODate,
  entries: Record<string, Entry>,
  exceptions: Record<string, DayException>,
  today: ISODate = todayISO(),
  weekStartsOn: 0 | 1 = 1,
): RoutineWeek {
  const dates = weekDatesISO(weekStart, weekStartsOn);
  const created = dateOfInstant(routine.createdAt);
  const inProgress = diffDaysISO(today, addDaysISO(weekStart, 6)) <= 0;

  let scheduled = 0;
  let exceptionDays = 0;
  for (const d of dates) {
    if (!isScheduled(routine, d)) continue;
    if (diffDaysISO(created, d) > 0) continue; // before creation
    if (diffDaysISO(d, today) > 0) continue; // future
    if (exceptionFor(exceptions, routine.id, d)) {
      exceptionDays++;
      continue;
    }
    if (isPausedOn(routine, d)) continue;
    scheduled++;
  }

  const weekEntries = Object.values(entries).filter(
    (e) => e.routineId === routine.id && diffDaysISO(e.date, weekStart) >= 0 && diffDaysISO(e.date, addDaysISO(weekStart, 6)) <= 0,
  );

  const states = dates.map((d) => dayState(routine, d, entries, exceptions, today));
  const completedDays = states.filter((s) => s === 'full' || s === 'minimum').length;
  const minimumDays = states.filter((s) => s === 'minimum').length;
  const partialDays = states.filter((s) => s === 'partial').length;
  const totalValue = weekEntries.reduce((s, e) => s + e.value, 0);

  // 'check' actual = days showed up; amount measures actual = total logged.
  const actual = routine.measure === 'check' ? completedDays : totalValue;

  const effectiveTarget =
    routine.measure === 'check'
      ? Math.min(routine.target.perWeek, Math.max(scheduled, 0))
      : routine.target.perWeek;
  // A week is exempt when nothing could be judged: every schedulable day was
  // excepted or paused, hadn't arrived yet, or predates the routine — AND
  // nothing was logged anyway (entries on odd days still count, so a week
  // with real activity is never exempt for amount-measure routines).
  const exempt =
    scheduled === 0 && (routine.measure === 'check' ? completedDays === 0 : totalValue === 0);
  const hit = !exempt && effectiveTarget > 0 && actual >= effectiveTarget;

  return {
    routineId: routine.id,
    weekStart,
    availableDays: scheduled,
    effectiveTarget,
    actual,
    completedDays,
    minimumDays,
    partialDays,
    exceptionDays,
    sessions: weekEntries.length,
    totalValue,
    hit,
    exempt,
    inProgress,
  };
}

export interface Scorecard {
  weekStart: ISODate;
  weeks: RoutineWeek[];
  /** Routines that count this week (not exempt). */
  scored: number;
  hits: number;
  hitRate: number | null; // null when nothing was scoreable
  totalSessions: number;
  totalMinutes: number; // actual time across duration entries
  inProgress: boolean;
}

export function weeklyScorecard(
  routines: Routine[],
  weekStart: ISODate,
  entries: Record<string, Entry>,
  exceptions: Record<string, DayException>,
  today: ISODate = todayISO(),
  weekStartsOn: 0 | 1 = 1,
): Scorecard {
  const weeks = routines
    .filter((r) => r.status !== 'archived')
    .map((r) => routineWeek(r, weekStart, entries, exceptions, today, weekStartsOn));
  const scored = weeks.filter((w) => !w.exempt);
  const hits = scored.filter((w) => w.hit).length;
  return {
    weekStart,
    weeks,
    scored: scored.length,
    hits,
    hitRate: scored.length ? hits / scored.length : null,
    totalSessions: weeks.reduce((s, w) => s + w.sessions, 0),
    totalMinutes: weeks.reduce(
      (s, w) => s + (routines.find((r) => r.id === w.routineId)?.measure === 'duration' ? w.totalValue : 0),
      0,
    ),
    inProgress: diffDaysISO(today, addDaysISO(weekStart, 6)) <= 0,
  };
}

// ── Completed weeks history (for bands & review) ────────────────────────────

/** Week starts from routine creation through the most recent COMPLETED week. */
export function completedWeekStarts(routine: Routine, today: ISODate = todayISO(), weekStartsOn: 0 | 1 = 1): ISODate[] {
  const created = dateOfInstant(routine.createdAt);
  const thisWeek = weekStartISO(today, weekStartsOn);
  const first = weekStartISO(created, weekStartsOn);
  const out: ISODate[] = [];
  let cur = first;
  for (let i = 0; i < 520; i++) {
    if (diffDaysISO(cur, thisWeek) >= 0) break;
    out.push(cur);
    cur = addDaysISO(cur, 7);
  }
  return out;
}

/** Is 'date' inside [from, to]? Inclusive both ends. */
export function inRange(date: ISODate, from: ISODate, to: ISODate): boolean {
  return diffDaysISO(date, from) >= 0 && diffDaysISO(to, date) >= 0;
}

/** All dates covered by a routine's pause intervals inside a range. */
export function pausedRangeDates(routine: Routine, from: ISODate, to: ISODate): ISODate[] {
  const out = new Set<ISODate>();
  for (const p of routine.pauses ?? []) {
    const end = p.to ?? to;
    for (const d of rangeDatesISO(p.from, end)) {
      if (inRange(d, from, to)) out.add(d);
    }
  }
  return [...out];
}
