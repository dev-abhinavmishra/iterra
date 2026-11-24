import { describe, expect, it } from 'vitest';
import { attemptErrorCues, latestErrorCue, solveAssistanceFor, usedHintAssistance } from './cues';
import type { Attempt, ErrorCue, Problem } from './types';

const cue = (id: string, text: string, createdAt: string): ErrorCue => ({
  id,
  text,
  sourceAttemptId: `a_${id}`,
  createdAt,
});

const problem = (cues: ErrorCue[] = []): Problem => ({
  id: 'p1',
  topic: 'algebra',
  promptDoc: 'solve',
  answerSpec: { kind: 'open' },
  workedSolutionDoc: '',
  hints: [],
  errorCues: cues,
  tags: [],
  difficulty: 3,
  attachments: [],
  createdAt: '',
  archived: false,
});

const attempt = (patch: Partial<Attempt> = {}): Attempt => ({
  id: 'a2',
  problemId: 'p1',
  startedAt: '2026-01-02T00:00:00Z',
  work: [],
  confidence: 3,
  hintLevel: 0,
  hintReveals: [],
  ...patch,
});

describe('error cues', () => {
  it('latestErrorCue picks the newest non-empty cue', () => {
    const p = problem([
      cue('c1', 'first cue', '2026-01-01T00:00:00Z'),
      cue('c2', '   ', '2026-01-03T00:00:00Z'),
      cue('c3', 'latest cue', '2026-01-02T00:00:00Z'),
    ]);
    expect(latestErrorCue(p)?.id).toBe('c3');
  });

  it('attemptErrorCues resolves only cues this attempt revealed', () => {
    const p = problem([cue('c1', 'cue one', '2026-01-01T00:00:00Z'), cue('c2', 'cue two', '2026-01-02T00:00:00Z')]);
    const a = attempt({ cueReveals: [{ cueId: 'c2', at: '2026-01-02T01:00:00Z' }] });
    expect(attemptErrorCues(a, p).map((c) => c.id)).toEqual(['c2']);
    expect(attemptErrorCues(attempt(), p)).toEqual([]);
  });

  it('solveAssistanceFor classifies independent, authored-hint, and cue-assisted solves', () => {
    expect(solveAssistanceFor(attempt())).toBe('independent');
    expect(solveAssistanceFor(attempt({ hintLevel: 2 }))).toBe('hint-assisted');
    expect(solveAssistanceFor(attempt({ cueReveals: [{ cueId: 'c1', at: 't' }] }))).toBe('cue-assisted');
    expect(usedHintAssistance(attempt({ cueReveals: [{ cueId: 'c1', at: 't' }] }))).toBe(true);
    expect(usedHintAssistance(attempt())).toBe(false);
  });
});
