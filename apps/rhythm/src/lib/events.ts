// ── Suite event model ────────────────────────────────────────────────────────
// Rhythm consumes normalized events — never another app's internal store.
// Events are append-only, deduplicated by id, attributable to a source app, and
// removable together with that source (reversibility). Routine entries are
// derived from events but keep a visible link back to the evidence.

import type {
  Entry,
  EventMapping,
  Routine,
  RoutineEvent,
  SuiteApp,
} from './types';
import { dateOfInstant, nowISO, uid } from './dates';

export const KNOWN_EVENT_TYPES = [
  'timer.session.completed',
  'flashcards.review.completed',
  'ink.focus.completed',
  'proof.session.completed',
  'syllabus.weekly_review.completed',
  'gradestack.assessment.graded',
  'modular.note.created',
] as const;

export const KNOWN_APPS: SuiteApp[] = [
  'timer',
  'flashcards',
  'ink',
  'proof',
  'syllabus',
  'gradestack',
  'modular',
];

// ── Validation / normalization ───────────────────────────────────────────────

export interface EventDraft {
  id: string;
  type: string;
  occurredAt: string;
  sourceApp: SuiteApp;
  durationSeconds?: number;
  courseId?: string;
  resourceId?: string;
  metrics?: Record<string, number>;
}

/** Coerce an unknown payload into a RoutineEvent, or return why it failed. */
export function normalizeEvent(raw: unknown):
  | { ok: true; event: RoutineEvent }
  | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'not an object' };
  const r = raw as Record<string, unknown>;

  const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : null;
  if (!id) return { ok: false, error: 'missing id' };

  const type = typeof r.type === 'string' && r.type.trim() ? r.type.trim() : null;
  if (!type) return { ok: false, error: 'missing type' };

  const occurredAt = typeof r.occurredAt === 'string' ? r.occurredAt : null;
  if (!occurredAt || Number.isNaN(new Date(occurredAt).getTime())) {
    return { ok: false, error: 'missing/invalid occurredAt' };
  }

  const sourceApp: SuiteApp =
    typeof r.sourceApp === 'string' && KNOWN_APPS.includes(r.sourceApp as SuiteApp)
      ? (r.sourceApp as SuiteApp)
      : 'other';

  const event: RoutineEvent = {
    id,
    type,
    occurredAt: new Date(occurredAt).toISOString(),
    sourceApp,
    receivedAt: nowISO(),
  };

  if (typeof r.durationSeconds === 'number' && Number.isFinite(r.durationSeconds) && r.durationSeconds > 0) {
    event.durationSeconds = Math.round(r.durationSeconds);
  }
  if (typeof r.courseId === 'string' && r.courseId) event.courseId = r.courseId;
  if (typeof r.resourceId === 'string' && r.resourceId) event.resourceId = r.resourceId;
  if (typeof r.metrics === 'object' && r.metrics !== null) {
    const metrics: Record<string, number> = {};
    for (const [k, v] of Object.entries(r.metrics as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) metrics[k] = v;
    }
    if (Object.keys(metrics).length) event.metrics = metrics;
  }
  return { ok: true, event };
}

// ── Matching & derivation ────────────────────────────────────────────────────

/** Does a mapping's pattern match this event type? 'timer.*' or exact. */
export function mappingMatches(mapping: EventMapping, eventType: string): boolean {
  if (!mapping.enabled) return false;
  if (mapping.eventType === eventType) return true;
  if (mapping.eventType.endsWith('.*')) {
    return eventType.startsWith(mapping.eventType.slice(0, -1));
  }
  return false;
}

/**
 * The entry an event would produce for a routine under a mapping — the
 * derivation is pure so Connections can preview it before enabling.
 */
export function deriveEntry(
  event: RoutineEvent,
  routine: Routine,
  mapping: EventMapping,
): Omit<Entry, 'id' | 'createdAt'> | null {
  const date = dateOfInstant(event.occurredAt);
  let value = 1;
  switch (mapping.valueRule) {
    case 'presence':
      value = 1;
      break;
    case 'duration':
      if (!event.durationSeconds) return null;
      value = Math.max(1, Math.round(event.durationSeconds / 60));
      break;
    case 'metric': {
      const v = mapping.metricKey ? event.metrics?.[mapping.metricKey] : undefined;
      if (v === undefined) return null;
      value = v;
      break;
    }
  }
  return {
    routineId: routine.id,
    date,
    value,
    source: 'event',
    eventId: event.id,
  };
}

/** All mappings that would fire for an event. */
export function matchMappings(mappings: EventMapping[], event: RoutineEvent): EventMapping[] {
  return mappings.filter((m) => mappingMatches(m, event.type));
}

// ── Intake ───────────────────────────────────────────────────────────────────

export type IntakeResult =
  | { kind: 'accepted'; event: RoutineEvent; entries: Omit<Entry, 'id' | 'createdAt'>[] }
  | { kind: 'duplicate'; event: RoutineEvent }
  | { kind: 'unmapped'; event: RoutineEvent }
  | { kind: 'invalid'; error: string };

/**
 * Feed one raw payload through validation, dedup and mapping — the same path
 * used by the deep-link intake, file import, and the Connections paste box.
 */
export function intakeEvent(
  raw: unknown,
  existingEvents: Record<string, RoutineEvent>,
  mappings: EventMapping[],
  routines: Record<string, Routine>,
): IntakeResult {
  const n = normalizeEvent(raw);
  if (!n.ok) return { kind: 'invalid', error: n.error };
  const event = n.event;

  // Dedup by id — a re-sent event is stored once, silently absorbed.
  if (existingEvents[event.id]) return { kind: 'duplicate', event };

  const fired = matchMappings(mappings, event);
  const entries: Omit<Entry, 'id' | 'createdAt'>[] = [];
  for (const m of fired) {
    const routine = routines[m.routineId];
    if (!routine || routine.status === 'archived') continue;
    const e = deriveEntry(event, routine, m);
    if (e) entries.push(e);
  }
  return { kind: entries.length ? 'accepted' : 'unmapped', event, entries };
}

// ── Removal (reversibility) ─────────────────────────────────────────────────

/** Ids of every entry derived from a source app's events. */
export function entriesFromSource(
  entries: Record<string, Entry>,
  events: Record<string, RoutineEvent>,
  sourceApp: string,
): string[] {
  const eventIds = new Set(
    Object.values(events)
      .filter((e) => e.sourceApp === sourceApp)
      .map((e) => e.id),
  );
  return Object.values(entries)
    .filter((en) => en.eventId && eventIds.has(en.eventId))
    .map((en) => en.id);
}

// ── Display helpers ──────────────────────────────────────────────────────────

export function eventTypeLabel(type: string): string {
  return type;
}

export function summarizeEvent(event: RoutineEvent): string {
  const parts: string[] = [];
  if (event.durationSeconds) parts.push(`${Math.round(event.durationSeconds / 60)}m`);
  if (event.metrics) {
    for (const [k, v] of Object.entries(event.metrics)) parts.push(`${k} ${v}`);
  }
  return parts.join(' · ') || 'event';
}

export function newMapping(eventType: string, routineId: string): EventMapping {
  return {
    id: uid('map'),
    eventType,
    routineId,
    valueRule: 'presence',
    enabled: true,
    createdAt: nowISO(),
  };
}
