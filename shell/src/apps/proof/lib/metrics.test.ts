import { describe, it, expect } from 'vitest';
import { unaidedSuccess, hintLevelSuccess, calibrationGap, errorRecurrence, topicCoverage, totals } from './metrics';
import type { Attempt, ErrorRecord, Problem } from './types';

const att = (patch: Partial<Attempt>): Attempt => ({
  id: Math.random().toString(36).slice(2),
  problemId: 'p1',
  startedAt: '2026-01-01T00:00:00Z',
  submittedAt: '2026-01-01T00:05:00Z',
  work: [],
  confidence: 3,
  hintLevel: 0,
  hintReveals: [],
  ...patch,
});

describe('metrics', () => {
  it('unaided success counts only hintLevel-0 attempts', () => {
    const a = att({ result: 'correct', hintLevel: 0 });
    const b = att({ result: 'correct', hintLevel: 2 });
    const c = att({ result: 'incorrect', hintLevel: 0 });
    const r = unaidedSuccess([a, b, c]);
    expect(r.of).toBe(2);
    expect(r.hits).toBe(1);
    expect(r.rate).toBe(0.5);
  });
  it('hint-level success separates by level', () => {
    const a = att({ result: 'correct', hintLevel: 1 });
    const b = att({ result: 'incorrect', hintLevel: 1 });
    const c = att({ result: 'correct', hintLevel: 4 });
    const r = hintLevelSuccess([a, b, c]);
    expect(r.find((x) => x.level === 1)).toEqual({ level: 1, hits: 1, of: 2 });
    expect(r.find((x) => x.level === 4)).toEqual({ level: 4, hits: 1, of: 1 });
  });
  it('calibration gap is positive when overconfident', () => {
    const over = att({ confidence: 5, result: 'incorrect' });
    expect(calibrationGap([over])!).toBeGreaterThan(0);
    const under = att({ confidence: 1, result: 'correct' });
    expect(calibrationGap([under])!).toBeLessThan(0);
    expect(calibrationGap([])).toBeNull();
  });
  it('error recurrence counts and orders', () => {
    const e = (category: ErrorRecord['category'], at: string): ErrorRecord => ({
      id: Math.random().toString(36).slice(2),
      attemptId: 'a',
      problemId: 'p',
      category,
      divergence: '',
      repairCue: '',
      divergentSteps: [],
      createdAt: at,
    });
    const r = errorRecurrence([
      e('algebra-arithmetic', '2026-01-02'),
      e('misread-prompt', '2026-01-01'),
      e('algebra-arithmetic', '2026-01-03'),
    ]);
    expect(r[0].category).toBe('algebra-arithmetic');
    expect(r[0].count).toBe(2);
    expect(r[0].latest).toBe('2026-01-03');
  });
  it('topic coverage reports attempted/total + unaided rate', () => {
    const prob = (id: string, topic: string): Problem => ({
      id, topic, promptDoc: '', answerSpec: { kind: 'open' }, workedSolutionDoc: '',
      hints: [], tags: [], difficulty: 3, attachments: [], createdAt: '', archived: false,
    });
    const problems = [prob('p1', 'algebra'), prob('p2', 'algebra'), prob('p3', 'trig')];
    const attempts = [att({ problemId: 'p1', result: 'correct' })];
    const r = topicCoverage(problems, attempts);
    const algebra = r.find((x) => x.topic === 'algebra')!;
    expect(algebra.attempted).toBe(1);
    expect(algebra.total).toBe(2);
    expect(algebra.unaidedRate).toBe(1);
  });
  it('totals summarizes attempts', () => {
    const t = totals([att({ result: 'correct' }), att({ result: 'partial' })], []);
    expect(t.attempts).toBe(2);
    expect(t.avgMinutes).toBe(5);
  });
});
