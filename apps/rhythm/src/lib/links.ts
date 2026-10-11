// ── Suite link contracts ─────────────────────────────────────────────────────
// Rhythm is a consumer, not an orchestrator: it receives events, it doesn't
// launch other apps. Two URL shapes are honored:
//
//   Inbound event push:  /?event=<base64url JSON>
//     Another app (or a webhook harness) delivers one normalized event.
//
//   Inbound routine launch: /?from=<app>&routine=<name>
//     A sibling app deep-links a student to check in — lands on Today with the
//     named routine focused. Optional; the app is complete without it.
//
//   Inbound experiment open: /?experiment=<id>
//     Lands on the Experiments view with that card scrolled into view and lit;
//     an unknown id degrades to the plain list.
//
// Outbound, Rhythm only renders *source* links — "open the deck this event came
// from" — using each app's published link format, from configurable base URLs.

import type { AppSettings, RoutineEvent, SuiteApp } from './types';
import { parseEventParam } from './import';

export interface InboundLink {
  event?: unknown;
  routineName?: string;
  experimentId?: string;
  from?: string;
}

export function parseInboundLink(search: string): InboundLink | null {
  const q = new URLSearchParams(search);
  const eventParam = q.get('event');
  const from = q.get('from') || undefined;
  const routineName = q.get('routine') || undefined;
  const experimentId = q.get('experiment') || undefined;
  if (!eventParam && !from && !routineName && !experimentId) return null;
  const link: InboundLink = { from, routineName, experimentId };
  if (eventParam) {
    const parsed = parseEventParam(eventParam);
    if (parsed !== null) link.event = parsed;
  }
  return link;
}

const APP_BASE_KEYS: Record<SuiteApp, keyof AppSettings | null> = {
  timer: 'timerBaseUrl',
  flashcards: 'flashcardsBaseUrl',
  ink: 'inkBaseUrl',
  proof: 'proofBaseUrl',
  syllabus: 'syllabusBaseUrl',
  gradestack: 'gradestackBaseUrl',
  modular: 'modularBaseUrl',
  other: null,
};

/** Where an event's source app lives (for evidence links + connect hints). */
export function appBaseUrl(app: SuiteApp, settings: AppSettings): string | null {
  const key = APP_BASE_KEYS[app];
  if (!key) return null;
  const v: unknown = settings[key];
  return typeof v === 'string' && v ? v.replace(/\/$/, '') : null;
}

/** A link back to the evidence inside the source app, when we can form one. */
export function evidenceUrl(event: RoutineEvent, settings: AppSettings): string | null {
  const base = appBaseUrl(event.sourceApp, settings);
  if (!base || !event.resourceId) return null;
  const id = encodeURIComponent(event.resourceId);
  switch (event.sourceApp) {
    case 'flashcards':
      return `${base}/?deck=${id}`;
    case 'ink':
      return `${base}/?note=${id}`;
    case 'gradestack':
      return `${base}/?assessment=${id}`;
    case 'modular':
      return `${base}/?source=${id}`;
    case 'proof':
      return `${base}/?problem=${id}`;
    default:
      return null;
  }
}

export const APP_DISPLAY: Record<SuiteApp, string> = {
  timer: 'Timer',
  flashcards: 'Flashcards',
  ink: 'Ink',
  proof: 'Proof',
  syllabus: 'Syllabus',
  gradestack: 'GradeStack',
  modular: 'Modular AI',
  other: 'Other',
};
