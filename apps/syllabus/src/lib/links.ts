// ── Inter-app deep links ─────────────────────────────────────────────────────
// Syllabus is the orchestrator: blocks launch Timer with full context, and
// commitments link out to Ink notes, Modular AI sources, Flashcards decks and
// GradeStack assessments. Base URLs are settings so a fork or local dev of any
// app can be retargeted.

import type { AppSettings, Commitment, Course, LinkedApp, WorkBlock } from './types';

export interface AppBase {
  app: LinkedApp;
  name: string;
  baseUrl: (s: AppSettings) => string;
}

export const APP_BASES: AppBase[] = [
  { app: 'timer', name: 'Timer', baseUrl: (s) => s.timerBaseUrl },
  { app: 'ink', name: 'Ink', baseUrl: (s) => s.inkBaseUrl },
  { app: 'modular', name: 'Modular AI', baseUrl: (s) => s.modularBaseUrl },
  { app: 'flashcards', name: 'Flashcards', baseUrl: (s) => s.flashcardsBaseUrl },
  { app: 'gradestack', name: 'GradeStack', baseUrl: (s) => s.gradestackBaseUrl },
];

/**
 * Build the Timer deep link that carries a work block's context.
 * Contract documented in docs/TIMER-LINK.md — Timer reads:
 *   ?intent=<session label>&minutes=<n>&course=<code>&from=syllabus&block=<id>&return=<origin>
 * `return` tells Timer where to file actual minutes on completion.
 */
export function timerDeepLink(opts: {
  settings: AppSettings;
  block: WorkBlock;
  commitment: Commitment;
  course?: Course;
}): string {
  const { settings, block, commitment, course } = opts;
  const base = settings.timerBaseUrl.replace(/\/$/, '');
  const params = new URLSearchParams();
  const intent = `${course ? course.code + ' — ' : ''}${commitment.title}${block.label && block.label !== 'work' ? ` · ${block.label}` : ''}`;
  params.set('intent', intent);
  params.set('minutes', String(block.plannedMinutes));
  if (course) params.set('course', course.code);
  params.set('from', 'syllabus');
  params.set('block', block.id);
  if (typeof window !== 'undefined') params.set('return', window.location.origin);
  return `${base}/?${params.toString()}`;
}

/** Compose a deep link for a stored resource, by app. */
export function resourceDeepLink(app: LinkedApp, resourceId: string, settings: AppSettings): string {
  const id = encodeURIComponent(resourceId);
  switch (app) {
    case 'ink':
      return `${settings.inkBaseUrl.replace(/\/$/, '')}/?note=${id}`;
    case 'modular':
      return `${settings.modularBaseUrl.replace(/\/$/, '')}/?source=${id}`;
    case 'flashcards':
      return `${settings.flashcardsBaseUrl.replace(/\/$/, '')}/?deck=${id}`;
    case 'gradestack':
      return `${settings.gradestackBaseUrl.replace(/\/$/, '')}/?assessment=${id}`;
    default:
      return resourceId; // already a URL
  }
}

export function appBadge(app: LinkedApp): string {
  switch (app) {
    case 'timer':
      return 'TIMER';
    case 'ink':
      return 'INK';
    case 'modular':
      return 'MODULAR';
    case 'flashcards':
      return 'CARDS';
    case 'gradestack':
      return 'GRADE';
    default:
      return 'LINK';
  }
}
