import { describe, it, expect } from 'vitest';
import { autoCheck } from './checking';
import type { Attempt, Rubric } from './types';

const baseAttempt = (patch: Partial<Attempt>): Attempt => ({
  id: 'a1',
  problemId: 'p1',
  startedAt: '2026-01-01T00:00:00Z',
  work: [],
  confidence: 3,
  hintLevel: 0,
  hintReveals: [],
  ...patch,
});

describe('autoCheck', () => {
  it('exact — case-insensitive by default', () => {
    const v = autoCheck(
      { kind: 'exact', expected: 'Mitochondria' },
      baseAttempt({ answer: ' mitochondria ' }),
    );
    expect(v.result).toBe('correct');
  });
  it('exact — fails when different', () => {
    const v = autoCheck({ kind: 'exact', expected: '42' }, baseAttempt({ answer: '41' }));
    expect(v.result).toBe('incorrect');
    expect(v.detail).toContain('42');
  });
  it('numeric — within tolerance', () => {
    const v = autoCheck(
      { kind: 'numeric', value: 9.8, tolerance: 0.05, unit: 'm/s^2' },
      baseAttempt({ answer: '9.81 m/s^2' }),
    );
    expect(v.result).toBe('correct');
  });
  it('numeric — right value, wrong unit → partial', () => {
    const v = autoCheck(
      { kind: 'numeric', value: 9.8, tolerance: 0.05, unit: 'm/s^2' },
      baseAttempt({ answer: '9.8 ft/s^2' }),
    );
    expect(v.result).toBe('partial');
    expect(v.detail).toContain('m/s^2');
  });
  it('expression — equivalent form passes', () => {
    const v = autoCheck(
      { kind: 'expression', expected: 'x^2 + 2x + 1' },
      baseAttempt({ answer: '(x+1)^2' }),
    );
    expect(v.result).toBe('correct');
  });
  it('expression — wrong form fails', () => {
    const v = autoCheck(
      { kind: 'expression', expected: 'x^2 + 1' },
      baseAttempt({ answer: 'x^2 + 2' }),
    );
    expect(v.result).toBe('incorrect');
  });
  it('choice — single correct', () => {
    const v = autoCheck(
      { kind: 'choice', options: ['a', 'b', 'c'], correct: [1] },
      baseAttempt({ answerChoice: [1] }),
    );
    expect(v.result).toBe('correct');
  });
  it('choice — subset of correct multi → partial', () => {
    const v = autoCheck(
      { kind: 'choice', options: ['a', 'b', 'c'], correct: [0, 2] },
      baseAttempt({ answerChoice: [0] }),
    );
    expect(v.result).toBe('partial');
  });
  it('steps — all checked → correct (self mode)', () => {
    const v = autoCheck(
      { kind: 'steps', steps: ['s1', 's2', 's3'] },
      baseAttempt({ stepsChecked: [true, true, true] }),
    );
    expect(v.mode).toBe('self');
    expect(v.result).toBe('correct');
  });
  it('rubric — all criteria at top level → correct', () => {
    const rubric: Rubric = {
      id: 'r1',
      title: 'Proof quality',
      criteria: [
        { id: 'c1', text: 'setup' },
        { id: 'c2', text: 'justification' },
      ],
      levels: ['missing', 'partial', 'met'],
      scoringMode: 'all-or-nothing',
      createdAt: '',
    };
    const v = autoCheck(
      { kind: 'rubric', rubricId: 'r1' },
      baseAttempt({ rubricScores: { c1: 2, c2: 2 } }),
      rubric,
    );
    expect(v.result).toBe('correct');
    const v2 = autoCheck(
      { kind: 'rubric', rubricId: 'r1' },
      baseAttempt({ rubricScores: { c1: 2, c2: 1 } }),
      rubric,
    );
    expect(v2.result).toBe('partial');
  });
  it('open — ungraded, goes to compare', () => {
    const v = autoCheck({ kind: 'open' }, baseAttempt({}));
    expect(v.mode).toBe('ungraded');
  });
});
