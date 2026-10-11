// ── Inter-app deep links ─────────────────────────────────────────────────────
// Proof reuses the suite's contracts (documented in docs/SUITE-LINKS.md):
//   Timer      — same inbound contract Syllabus uses:
//                ?intent=<label>&minutes=<n>&course=<code>&from=proof&block=<id>&return=<origin>
//                return leg: ?completedBlock=<id>&actual=<min>
//   Flashcards — ?cards=<q:a;q:a>&title=<t>  (atomic misconception cards)
//   Ink        — no inbound link exists; export is a Markdown download
//   Syllabus   — inbound to Proof: ?from=syllabus&topic=<t>&minutes=<n>&course=<code>&intent=<label>

import type { AppSettings, Course, PracticeSession, Problem } from './types';

export function timerDeepLink(opts: {
  settings: AppSettings;
  session: PracticeSession;
  minutes: number;
  label: string;
  course?: Course;
}): string {
  const { settings, session, minutes, label, course } = opts;
  const base = settings.timerBaseUrl.replace(/\/$/, '');
  const params = new URLSearchParams();
  params.set('intent', label);
  params.set('minutes', String(minutes));
  if (course) params.set('course', course.code);
  params.set('from', 'proof');
  params.set('block', session.id);
  if (typeof window !== 'undefined') params.set('return', window.location.origin);
  return `${base}/?${params.toString()}`;
}

/**
 * Flashcards misconception export. The `?cards=` contract:
 *   cards=<q1:a1|ex1;q2:a2|ex2>&title=<deck title>
 * Cards must be atomic — a misconception or method-selection cue, never a
 * whole worked problem.
 */
export function flashcardsCardsLink(
  settings: AppSettings,
  cards: { q: string; a: string; ex?: string }[],
  title: string,
): string {
  const base = settings.flashcardsBaseUrl.replace(/\/$/, '');
  const params = new URLSearchParams();
  params.set('title', title);
  params.set('cards', cards.map((c) => `${c.q}:${c.a}${c.ex ? '|' + c.ex : ''}`).join(';'));
  return `${base}/?${params.toString()}`;
}

/** Build a misconception card from an error record + problem. */
export function misconceptionCard(opts: {
  category: string;
  repairCue: string;
  problem?: Problem;
}): { q: string; a: string; ex?: string } {
  const topicHint = opts.problem?.topic ? ` (${opts.problem.topic})` : '';
  return {
    q: `What cue signals the ${opts.category} trap${topicHint}?`,
    a: opts.repairCue,
    ex: opts.problem ? undefined : undefined,
  };
}

/** Markdown document for an Ink note export (downloaded, imported in Ink). */
export function inkNoteMarkdown(opts: {
  title: string;
  problem: Problem;
  divergence: string;
  repairCue: string;
  category: string;
}): string {
  const { title, problem, divergence, repairCue, category } = opts;
  return [
    `# ${title}`,
    '',
    problem.topic ? `*${problem.topic}*` : '',
    '',
    '## Problem',
    '',
    problem.promptDoc,
    '',
    '## Worked solution',
    '',
    problem.workedSolutionDoc,
    '',
    '## What I learned',
    '',
    `- **Where I diverged:** ${divergence || '—'}`,
    `- **Cue to notice next time:** ${repairCue || '—'}`,
    `- **Error class:** ${category}`,
    '',
  ]
    .filter((l) => l !== undefined)
    .join('\n');
}

/** Parse inbound params Proof understands (called once in boot). */
export interface InboundLink {
  kind: 'timer-return' | 'syllabus-session';
  sessionId?: string;
  actualMinutes?: number;
  // syllabus-session prefill:
  topic?: string;
  minutes?: number;
  course?: string;
  intent?: string;
}

export function parseInbound(search: string): InboundLink | null {
  const q = new URLSearchParams(search);
  const completed = q.get('completedBlock');
  if (completed) {
    return {
      kind: 'timer-return',
      sessionId: completed,
      actualMinutes: Number(q.get('actual')) || undefined,
    };
  }
  if (q.get('from') === 'syllabus' || q.get('intent') || q.get('topic') || q.get('minutes')) {
    return {
      kind: 'syllabus-session',
      topic: q.get('topic') ?? undefined,
      minutes: Number(q.get('minutes')) || undefined,
      course: q.get('course') ?? undefined,
      intent: q.get('intent') ?? undefined,
    };
  }
  return null;
}
