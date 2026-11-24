// ── Error-cue hints ──────────────────────────────────────────────────────────
// A filed repair cue stays attached to its problem and is offered — never
// auto-applied — as a hint on later attempts. The attempt records the reveal;
// a correct result is stamped with how much assistance it used.

import type { Attempt, ErrorCue, Problem, SolveAssistance } from './types';

export const SOLVE_ASSISTANCE_LABELS: Record<SolveAssistance, string> = {
  independent: 'independent',
  'hint-assisted': 'hint-assisted',
  'cue-assisted': 'cue-assisted',
};

export function latestErrorCue(problem?: Problem): ErrorCue | undefined {
  return (problem?.errorCues ?? [])
    .filter((cue) => !!cue?.text?.trim())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function attemptErrorCues(attempt: Attempt | undefined, problem?: Problem): ErrorCue[] {
  const byId = new Map((problem?.errorCues ?? []).map((cue) => [cue.id, cue]));
  return (attempt?.cueReveals ?? [])
    .map((reveal) => byId.get(reveal.cueId))
    .filter((cue): cue is ErrorCue => !!cue && !!cue.text.trim());
}

/** Assistance a correct solve used. Call only when recording a solve. */
export function solveAssistanceFor(attempt: Attempt): SolveAssistance {
  if (attempt.cueReveals?.length) return 'cue-assisted';
  if (attempt.hintLevel > 0) return 'hint-assisted';
  return 'independent';
}

/** True when the attempt used any hint surface (authored ladder or error cue). */
export function usedHintAssistance(attempt: Attempt): boolean {
  return attempt.hintLevel > 0 || !!attempt.cueReveals?.length;
}
