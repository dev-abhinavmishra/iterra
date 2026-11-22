import type { ImportPayload, ImportRow } from './import';
import type { CommitmentType, Term } from './types';
import { dueDateISO, isoAtTime, localTimeHHMM } from './utils';

export const MAX_SCHEDULE_LENGTH = 30_000;
const MAX_ROWS = 120;
const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const monthWords = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
const datePattern = new RegExp(
  `(?<![\\d/])\\b(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}/\\d{1,2}(?:/\\d{4})?|(?:${monthWords})\\.?[ \\t]+\\d{1,2}(?:st|nd|rd|th)?(?:(?:,\\s*|\\s+)\\d{4})?)(?![\\d/])`,
  'gi',
);

type TermDates = Pick<Term, 'startDate' | 'endDate'>;

function calendarDate(year: number, month: number, day: number): string | undefined {
  if (year < 1900 || year > 9999) return;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return;
  return date.toISOString().slice(0, 10);
}

function resolveDate(text: string, term?: TermDates): string | undefined {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return calendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const slash = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(text);
  const named = /^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:[,\s]+(\d{4}))?$/i.exec(text);
  if (!slash && !named) return;
  const month = slash ? Number(slash[1]) : months.indexOf(named![1].slice(0, 3).toLowerCase()) + 1;
  const day = Number((slash ?? named)![2]);
  const year = (slash ?? named)![3];
  if (year) return calendarDate(Number(year), month, day);
  if (!term) return;
  const first = Number(term.startDate.slice(0, 4));
  const last = Number(term.endDate.slice(0, 4));
  if (!first || !last || last - first > 1 || last < first) return;
  const possible = [...new Set([first, last])].map(year => calendarDate(year, month, day))
    .filter((date): date is string => !!date && date >= term.startDate && date <= term.endDate);
  return possible.length === 1 ? possible[0] : undefined;
}

function readTime(text: string) {
  const named = /^[ \t]+(?:at\s+)?(noon|midnight)\b/i.exec(text);
  if (named) return { end: named[0].length, value: named[1].toLowerCase() === 'noon' ? '12:00' : '00:00' };
  const time = /^(?:[ \t]+(?:at\s+)?|T)(?:(\d{1,2})(?::(\d{2}))?[ \t]*([ap]\.?m\.?)(?![a-z\d])|(\d{1,2}):(\d{2})\b)/i.exec(text);
  if (!time) return { end: 0, value: '23:59' };
  let hours = Number(time[1] ?? time[4]);
  const minutes = Number(time[2] ?? time[5] ?? 0);
  if (hours > 23 || minutes > 59 || (time[3] && (hours < 1 || hours > 12))) return;
  if (time[3]) hours = (hours % 12) + (time[3].toLowerCase().startsWith('p') ? 12 : 0);
  return { end: time[0].length, value: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}` };
}

function titleAndType(title: string): [CommitmentType, number] {
  if (/\b(exam|midterm|final exam|test)\b/i.test(title)) return ['exam', 150];
  if (/\b(quiz)\b/i.test(title)) return ['quiz', 30];
  if (/\b(lab|practical)\b/i.test(title)) return ['lab', 75];
  if (/\b(project|presentation)\b/i.test(title)) return ['project', 120];
  if (/\b(reading|read)\b/i.test(title)) return ['reading', 35];
  return ['assignment', 60];
}

function rowFromLine(line: string, term?: TermDates): ImportRow | undefined {
  const dates = [...line.matchAll(datePattern)];
  if (dates.length !== 1) return;
  const date = dates[0];
  const day = resolveDate(date[0], term);
  const dateEnd = date.index + date[0].length;
  const clock = readTime(line.slice(dateEnd));
  if (!day || !clock) return;
  const before = line.slice(0, date.index)
    .replace(/\b(?:due(?:\s+(?:on|by))?|on|by)\s*[:–—,\t-]*\s*$/i, '')
    .replace(/(?:^|[\s,(])(?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)[.,\s]*$/i, '');
  const title = `${before} ${line.slice(dateEnd + clock.end)}`
    .trim().replace(/^[\s,"|:–—\-•]+|[\s,"|:–—\-]+$/g, '').replace(/\s+/g, ' ');
  if (!/[\p{L}]/u.test(title)) return;
  const dueAt = isoAtTime(day, clock.value);
  if (dueDateISO(dueAt) !== day || localTimeHHMM(dueAt) !== clock.value) return;
  const [type, estimatedMinutes] = titleAndType(title);
  return { title, type, dueAt, estimatedMinutes, weight: 0, accepted: true };
}

export function parseSchedulePaste(text: string, term?: TermDates) {
  const rows: ImportRow[] = [];
  const skipped: { line: number; text: string }[] = [];
  let course: Pick<ImportPayload, 'code' | 'courseName'> = {};
  let contentSeen = false;
  const lines = text.slice(0, MAX_SCHEDULE_LENGTH).split(/\r?\n/);
  for (const [index, original] of lines.entries()) {
    const line = original.trim();
    if (!line || /^(?:assignments?|course schedule|schedule|deadlines?|due date(?:\t|,)(?:title|assignment))\s*[:]?$/i.test(line)) continue;
    const header = /^([a-z]{2,8}\s*[1-9]\d{2,3}[a-z]?)\s*(?:[:–—]|\s+-)\s*(.+)$/i.exec(line);
    if (header && !contentSeen) {
      course = { code: header[1].toUpperCase(), courseName: header[2] };
      contentSeen = true;
      continue;
    }
    contentSeen = true;
    const row = rows.length < MAX_ROWS ? rowFromLine(line, term) : undefined;
    if (row) rows.push(row);
    else skipped.push({ line: index + 1, text: line.slice(0, 180) });
  }
  return { payload: { source: 'schedule', ...course, rows } satisfies ImportPayload, skipped };
}

export function importIdentity(row: { title: string; dueAt: string }) {
  return JSON.stringify([row.title.trim().toLowerCase().replace(/\s+/g, ' '), dueDateISO(row.dueAt)]);
}
