import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ISODate } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid(prefix = ''): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}${Date.now().toString(36)}${rand}`;
}

// ── Civil dates ──────────────────────────────────────────────────────────────
// The folio plans in civil dates; conversions stay explicit so timezone and
// DST behaviour is testable.

const pad = (n: number) => String(n).padStart(2, '0');

export function todayISO(now = new Date()): ISODate {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDaysISO(iso: ISODate, days: number): ISODate {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function diffDaysISO(a: ISODate, b: ISODate): number {
  // b - a in civil days (DST-proof: both are midnight-normalized civil dates)
  const ms = Date.UTC(
    Number(b.slice(0, 4)),
    Number(b.slice(5, 7)) - 1,
    Number(b.slice(8, 10)),
  ) - Date.UTC(Number(a.slice(0, 4)), Number(a.slice(5, 7)) - 1, Number(a.slice(8, 10)));
  return Math.round(ms / 86400000);
}

export function weekStartISO(iso: ISODate, weekStartsOn: 0 | 1 = 1): ISODate {
  const d = fromISODate(iso);
  const dow = d.getDay(); // 0 Sun … 6 Sat
  const delta = weekStartsOn === 1 ? (dow + 6) % 7 : dow;
  return addDaysISO(iso, -delta);
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export function stampDate(iso: ISODate): string {
  // Registrar-stamp format: 'OCT 20'
  const d = fromISODate(iso);
  return `${MONTHS[d.getMonth()]} ${pad(d.getDate())}`;
}

export function dowName(iso: ISODate): string {
  return DAYS[fromISODate(iso).getDay()];
}

export function fullDate(iso: ISODate): string {
  const d = fromISODate(iso);
  return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function fmtMinutes(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function fmtTime12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${pad(m)} ${ampm}`;
}

export function addMinutesToTime(hhmm: string, min: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + min;
  return `${pad(Math.floor((total / 60) % 24))}:${pad(total % 60)}`;
}

export function isoAtTime(date: ISODate, hhmm: string): string {
  const d = fromISODate(date);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export function dueDateISO(dueAt: string): ISODate {
  // dueAt is an ISO instant → civil date in local time
  return toISODate(new Date(dueAt));
}

export function daysUntil(iso: ISODate, now = new Date()): number {
  return diffDaysISO(todayISO(now), iso);
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}
