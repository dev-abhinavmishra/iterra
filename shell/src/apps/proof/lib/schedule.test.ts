import { describe, it, expect } from 'vitest';
import { nextReview, buildSessionList, estimateMinutes } from './schedule';
import type { Problem, SessionRules } from './types';

const NOW = '2026-03-10T12:00:00.000Z';

describe('nextReview', () => {
  it('a miss schedules tomorrow and resets stability', () => {
    const r = nextReview({ problemId: 'p', result: 'incorrect', confidence: 4, attemptId: 'a', now: NOW });
    expect(r.dueAt.slice(0, 10)).toBe('2026-03-11');
    expect(r.stability).toBe(0);
    expect(r.lapses).toBe(1);
  });
  it('confident correct grows interval', () => {
    const first = nextReview({ problemId: 'p', result: 'correct', confidence: 5, attemptId: 'a1', now: NOW });
    const second = nextReview({
      problemId: 'p',
      result: 'correct',
      confidence: 5,
      attemptId: 'a2',
      prior: first,
      now: NOW,
    });
    expect(second.interval).toBeGreaterThan(first.interval);
    expect(second.stability).toBeGreaterThan(first.stability);
  });
  it('low-confidence correct gets short confirmatory interval', () => {
    const grown = nextReview({ problemId: 'p', result: 'correct', confidence: 5, attemptId: 'a', now: NOW });
    const unsure = nextReview({
      problemId: 'p',
      result: 'correct',
      confidence: 2,
      attemptId: 'b',
      prior: grown,
      now: NOW,
    });
    expect(unsure.interval).toBeLessThanOrEqual(2);
  });
  it('interval is capped', () => {
    let r = nextReview({ problemId: 'p', result: 'correct', confidence: 5, attemptId: 'a', now: NOW });
    for (let i = 0; i < 12; i++) {
      r = nextReview({ problemId: 'p', result: 'correct', confidence: 5, attemptId: `a${i}`, prior: r, now: NOW });
    }
    expect(r.interval).toBeLessThanOrEqual(60);
  });
});

const prob = (id: string, topic: string, difficulty = 3): Problem => ({
  id,
  topic,
  promptDoc: `p ${id}`,
  answerSpec: { kind: 'open' },
  workedSolutionDoc: '',
  hints: [],
  tags: [],
  difficulty: difficulty as Problem['difficulty'],
  attachments: [],
  createdAt: '',
  archived: false,
});

const rules = (patch: Partial<SessionRules>): SessionRules => ({
  courseIds: [],
  topics: [],
  minDifficulty: 1,
  maxDifficulty: 5,
  minutes: 30,
  newRatio: 0.5,
  order: 'blocked',
  ...patch,
});

describe('buildSessionList', () => {
  const problems = [
    prob('a', 'algebra'), prob('b', 'algebra'), prob('c', 'trig'),
    prob('d', 'trig'), prob('e', 'calc'), prob('f', 'calc'),
  ];

  it('respects topic filter', () => {
    const list = buildSessionList(rules({ topics: ['trig'] }), problems, {}, new Set());
    expect(list.every((c) => c.problem.topic === 'trig')).toBe(true);
  });

  it('pulls due retries first', () => {
    const reviews = {
      a: { problemId: 'a', dueAt: '2020-01-01T00:00:00Z', interval: 1, stability: 0, lapses: 1, lastResult: 'incorrect' as const, lastAttemptId: 'x' },
    };
    const list = buildSessionList(rules({ newRatio: 0 }), problems, reviews, new Set(['a']));
    expect(list[0].problem.id).toBe('a');
    expect(list[0].kind).toBe('retry');
  });

  it('interleaved order varies adjacent topics', () => {
    const list = buildSessionList(rules({ order: 'interleaved', minutes: 60, newRatio: 1 }), problems, {}, new Set());
    for (let i = 1; i < list.length; i++) {
      // with 3 topics and round-robin, neighbors should rarely match; require
      // at least one alternation in a 6-item session
      if (list[i].problem.topic !== list[i - 1].problem.topic) return;
    }
    expect.unreachable('interleaved session never changed topics');
  });

  it('blocked order groups topics', () => {
    const list = buildSessionList(rules({ order: 'blocked', minutes: 60, newRatio: 1 }), problems, {}, new Set());
    const topics = list.map((c) => c.problem.topic);
    const switches = topics.filter((t, i) => i > 0 && t !== topics[i - 1]).length;
    expect(switches).toBeLessThanOrEqual(2);
  });

  it('estimateMinutes scales with difficulty', () => {
    expect(estimateMinutes(1)).toBeLessThan(estimateMinutes(5));
  });
});
