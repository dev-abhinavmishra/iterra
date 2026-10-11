// ── Modular AI import payloads ───────────────────────────────────────────────
// Modular AI reads a syllabus PDF/image and posts a staging payload back here
// via ?import=<base64url JSON> (or a pasted JSON document). NOTHING commits on
// arrival — the payload lands in the Import sheet's confirmation table and
// only the checked rows are filed, per the app spec.

import type { CommitmentType, ISODateTime } from './types';

export interface ImportRow {
  type: CommitmentType;
  title: string;
  dueAt: ISODateTime;
  weight: number;
  estimatedMinutes: number;
  detail?: string;
  recur?: boolean; // files as a weekly recurring commitment
  accepted: boolean; // checkbox state in the confirmation table
}

export interface ImportPayload {
  source?: string; // 'modular' expected; anything is staged for review
  courseName?: string;
  code?: string;
  instructor?: string;
  meetingPattern?: string;
  rows: ImportRow[];
}

const TYPES: CommitmentType[] = ['assignment', 'exam', 'quiz', 'reading', 'project', 'lab', 'custom'];

function isType(v: unknown): v is CommitmentType {
  return typeof v === 'string' && (TYPES as string[]).includes(v);
}

function num(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

/** Accepts 'YYYY-MM-DD', 'YYYY-MM-DDTHH:MM...', 'mm/dd/yyyy', 'Mar 3 2027'… */
function toISODateTime(v: unknown): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.length === 10 ? `${s}T17:00` : s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function rowFrom(v: unknown): ImportRow | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;
  const title = typeof r.title === 'string' ? r.title.trim() : typeof r.name === 'string' ? r.name.trim() : '';
  if (!title) return null;
  const dueAt = toISODateTime(r.dueAt ?? r.due ?? r.date ?? r.dueDate);
  if (!dueAt) return null;
  return {
    type: isType(r.type) ? r.type : 'assignment',
    title,
    dueAt,
    weight: num(r.weight, 10, 0, 100),
    estimatedMinutes: num(r.estimatedMinutes ?? r.minutes ?? r.effort, 120, 0, 60 * 60),
    detail: typeof r.detail === 'string' ? r.detail : typeof r.notes === 'string' ? r.notes : undefined,
    recur: r.recur === true || r.recurrence === 'weekly',
    accepted: true,
  };
}

export interface ParseResult {
  ok: boolean;
  error?: string;
  payload?: ImportPayload;
  dropped?: number; // rows that failed validation
}

export function parseImportPayload(raw: string): ParseResult {
  let text = raw.trim();
  if (!text) return { ok: false, error: 'Empty payload.' };
  // base64url / base64 payloads arrive URL-safe; try decoding first
  if (!text.startsWith('{') && !text.startsWith('[')) {
    try {
      text = decodeURIComponent(escape(atob(text.replace(/-/g, '+').replace(/_/g, '/'))));
    } catch {
      return { ok: false, error: 'Payload is neither JSON nor base64.' };
    }
  }
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Payload is not valid JSON.' };
  }
  // rows may sit at top level or under commitments/items/rows
  const obj = (typeof doc === 'object' && doc !== null ? doc : {}) as Record<string, unknown>;
  const arr = Array.isArray(doc) ? doc : ((obj.commitments ?? obj.items ?? obj.rows) as unknown);
  if (!Array.isArray(arr)) return { ok: false, error: 'No commitment rows found in the payload.' };
  const rows = arr.map(rowFrom).filter((r): r is ImportRow => r !== null);
  const dropped = arr.length - rows.length;
  if (!rows.length) return { ok: false, error: 'Every row failed validation — need at least title + due date.', dropped };
  const courseName = typeof obj.courseName === 'string' ? obj.courseName : typeof obj.course === 'string' ? obj.course : undefined;
  return {
    ok: true,
    dropped: dropped > 0 ? dropped : undefined,
    payload: {
      source: typeof obj.source === 'string' ? obj.source : undefined,
      courseName,
      code: typeof obj.code === 'string' ? obj.code : undefined,
      instructor: typeof obj.instructor === 'string' ? obj.instructor : undefined,
      meetingPattern: typeof obj.meetingPattern === 'string' ? obj.meetingPattern : undefined,
      rows,
    },
  };
}
