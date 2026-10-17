// ── Civil-date utilities ─────────────────────────────────────────────────────
// The register thinks in local civil dates ('YYYY-MM-DD'), never UTC instants.
// toISOString() is banned here — it shifts dates across the timezone boundary.
// Weekday math goes through noon-anchored Dates so DST transitions can't skip
// or double a day.

import type { ISODate, ISODateTime } from './types';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Today as a civil date in the local timezone. */
export function todayISO(now: Date = new Date()): ISODate {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function nowISO(now: Date = new Date()): ISODateTime {
  return now.toISOString();
}

/** Parse 'YYYY-MM-DD' → { y, m, d } or null. */
export function parseISO(iso: ISODate): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

/** Noon-anchored Date for a civil date — immune to DST midnight edges. */
function noonOf(iso: ISODate): Date {
  const p = parseISO(iso);
  if (!p) throw new Error(`bad civil date: ${iso}`);
  return new Date(p.y, p.m - 1, p.d, 12, 0, 0, 0);
}

export function addDaysISO(iso: ISODate, days: number): ISODate {
  const dt = noonOf(iso);
  dt.setDate(dt.getDate() + days);
  return todayISO(dt);
}

export function diffDaysISO(a: ISODate, b: ISODate): number {
  // a - b in days, via noon anchors (safe across DST).
  const ms = noonOf(a).getTime() - noonOf(b).getTime();
  return Math.round(ms / 86_400_000);
}

/** Day of week for a civil date: 0=Sun … 6=Sat. */
export function weekdayOf(iso: ISODate): number {
  return noonOf(iso).getDay();
}

/** The civil date at the start of iso's week. weekStartsOn: 0=Sun, 1=Mon. */
export function weekStartISO(iso: ISODate, weekStartsOn: 0 | 1 = 1): ISODate {
  const wd = weekdayOf(iso);
  const back = (wd - weekStartsOn + 7) % 7;
  return addDaysISO(iso, -back);
}

/** All civil dates in the week containing iso, starting on weekStartsOn. */
export function weekDatesISO(iso: ISODate, weekStartsOn: 0 | 1 = 1): ISODate[] {
  const start = weekStartISO(iso, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
}

/** Every civil date in [from, to] inclusive. */
export function rangeDatesISO(from: ISODate, to: ISODate): ISODate[] {
  if (diffDaysISO(to, from) < 0) return [];
  const out: ISODate[] = [];
  let cur = from;
  const guard = 3700;
  for (let i = 0; i < guard; i++) {
    out.push(cur);
    if (cur === to) break;
    cur = addDaysISO(cur, 1);
  }
  return out;
}

// ── Formatting — the register's voice: slab dates, mono times ───────────────

/** 'OCT 11' */
export function fmtDay(iso: ISODate): string {
  const p = parseISO(iso);
  if (!p) return iso;
  return `${MONTHS[p.m - 1]} ${p.d}`;
}

/** 'SAT OCT 11' */
export function fmtDayFull(iso: ISODate): string {
  return `${DAYS[weekdayOf(iso)]} ${fmtDay(iso)}`;
}

/** 'OCT 11 – 17' or 'OCT 27 – NOV 2' — a week column heading. */
export function fmtWeekRange(weekStart: ISODate): string {
  const end = addDaysISO(weekStart, 6);
  const a = parseISO(weekStart)!, b = parseISO(end)!;
  if (a.m === b.m) return `${MONTHS[a.m - 1]} ${a.d} – ${b.d}`;
  return `${MONTHS[a.m - 1]} ${a.d} – ${MONTHS[b.m - 1]} ${b.d}`;
}

/** '1h 25m', '45m', '3h' — durations in the register voice. */
export function fmtMinutes(mins: number): string {
  const m = Math.round(mins);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
}

/** '4:05 PM' */
export function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${pad2(m)} ${ampm}`;
}

/** Extract the civil date of an ISO instant in the LOCAL timezone. */
export function dateOfInstant(isoDateTime: ISODateTime): ISODate {
  const d = new Date(isoDateTime);
  if (Number.isNaN(d.getTime())) return todayISO();
  return todayISO(d);
}

/** Tiny id — url-safe, sortable enough for ledger order. */
export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
