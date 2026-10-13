// ── Event import ─────────────────────────────────────────────────────────────
// Two intake paths carry events into the register:
//   • deep link  ?event=<base64url JSON>         (another app pushes one event)
//   • file/paste JSON — a single event, an array, or { "events": [...] }
// Everything is validated through normalizeEvent; bad rows are dropped with a
// reason, never silently accepted.

import type { RoutineEvent } from './types';

function base64UrlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return decodeURIComponent(
    Array.from(atob(padded))
      .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join(''),
  );
}

/** Parse the ?event= deep-link param into a raw event payload. */
export function parseEventParam(param: string): unknown | null {
  try {
    return JSON.parse(base64UrlDecode(param));
  } catch {
    return null;
  }
}

export interface ImportBatch {
  events: unknown[];
  /** Human-readable problems with the overall payload shape. */
  warnings: string[];
}

/** Accepts a single object, an array, or { events: [...] }. */
export function parseEventsJSON(text: string): ImportBatch | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: 'not valid JSON' };
  }
  const warnings: string[] = [];
  if (Array.isArray(parsed)) return { events: parsed, warnings };
  if (typeof parsed === 'object' && parsed !== null) {
    const o = parsed as Record<string, unknown>;
    if (Array.isArray(o.events)) return { events: o.events, warnings };
    if (typeof o.id === 'string' && typeof o.type === 'string') {
      return { events: [o], warnings: [] };
    }
    warnings.push('object had no "events" array and no id/type — treated as one event anyway');
    return { events: [o], warnings };
  }
  return { error: 'expected an event object or an array of events' };
}

export interface IntakeSummary {
  accepted: RoutineEvent[];
  duplicates: number;
  unmapped: RoutineEvent[];
  invalid: { index: number; error: string }[];
}
