import { describe, it, expect } from 'vitest';
import { scoreCommitment, planDay, reversePlan, missedBlocks, estimateRatio, gradeScenario, targetPercent, riskReason } from './schedule';
import { todayISO, addDaysISO, isoAtTime } from './utils';
import type { Commitment, Course, WorkBlock } from './types';

const course: Course = {
  id: 'c1', termId: 't1', name: 'Linear Algebra', code: 'MATH211',
  color: 'navy', archived: false, createdAt: '2026-01-01T00:00:00Z',
};

function mkCommitment(patch: Partial<Commitment>): Commitment {
  return {
    id: 'k1', courseId: 'c1', type: 'assignment', title: 'PS4',
    dueAt: isoAtTime(addDaysISO(todayISO(), 5), '23:59'),
    weight: 10, estimatedMinutes: 90, loggedMinutes: 0, status: 'open',
    pinned: false, dependencies: [], createdAt: todayISO() + 'T00:00:00Z',
    ...patch,
  };
}

const baseOpts = {
  today: todayISO(),
  all: {} as Record<string, Commitment>,
  courseById: { c1: course },
};

describe('scoreCommitment', () => {
  it('scores overdue work highest via the late factor', () => {
    const c = mkCommitment({ dueAt: isoAtTime(addDaysISO(todayISO(), -2), '23:59') });
    const s = scoreCommitment(c, { ...baseOpts, all: { k1: c } });
    expect(s.factors.some((f) => f.key === 'late')).toBe(true);
    expect(s.reason).toMatch(/Overdue by 2 days/);
  });

  it('explains itself in plain language', () => {
    const c = mkCommitment({ dueAt: isoAtTime(addDaysISO(todayISO(), 2), '23:59'), estimatedMinutes: 90 });
    const s = scoreCommitment(c, { ...baseOpts, all: { k1: c } });
    expect(s.reason).toMatch(/Due in 2 days/);
    expect(s.reason).toMatch(/90 min remain/);
  });

  it('a blocked commitment carries the dependency factor', () => {
    const dep = mkCommitment({ id: 'k0', title: 'Outline' });
    const c = mkCommitment({ id: 'k2', dependencies: ['k0'] });
    const s = scoreCommitment(c, { ...baseOpts, all: { k0: dep, k2: c } });
    expect(s.blockedBy?.id).toBe('k0');
    expect(s.factors.some((f) => f.key === 'dependency')).toBe(true);
  });

  it('pinned work gets a visible factor', () => {
    const c = mkCommitment({ pinned: true });
    const s = scoreCommitment(c, { ...baseOpts, all: { k1: c } });
    expect(s.factors.some((f) => f.key === 'pinned' && f.label === 'pinned by you')).toBe(true);
  });
});

describe('planDay', () => {
  it('proposes blocks within the available budget', () => {
    const c = mkCommitment({ estimatedMinutes: 180 });
    const { proposals } = planDay({
      today: todayISO(),
      availableMinutes: 120,
      commitments: [c],
      all: { k1: c },
      courseById: { c1: course },
      blocksOnDay: [],
      dismissedIds: new Set(),
      startTime: '16:00',
      maxBlock: 60,
    });
    const total = proposals.reduce((s, p) => s + p.plannedMinutes, 0);
    expect(total).toBeLessThanOrEqual(120);
    expect(proposals.length).toBeGreaterThan(0);
    expect(proposals[0].reasons[0].length).toBeGreaterThan(0);
  });

  it('never proposes for blocked or done commitments', () => {
    const dep = mkCommitment({ id: 'k0' });
    const c = mkCommitment({ id: 'k2', dependencies: ['k0'] });
    const doneC = mkCommitment({ id: 'k3', status: 'done' });
    const { proposals } = planDay({
      today: todayISO(), availableMinutes: 300,
      commitments: [c, doneC], all: { k0: dep, k2: c, k3: doneC },
      courseById: { c1: course }, blocksOnDay: [], dismissedIds: new Set(),
      startTime: '16:00', maxBlock: 90,
    });
    expect(proposals.length).toBe(0);
  });

  it('does not re-propose effort already booked today', () => {
    const c = mkCommitment({ estimatedMinutes: 90 });
    const booked: WorkBlock = {
      id: 'b9', commitmentId: 'k1', plannedDate: todayISO(), plannedStart: '16:00',
      plannedMinutes: 90, state: 'planned', phase: 'work', reasons: [], score: 0,
      deferCount: 0, order: 0, createdAt: '2026-01-01T00:00:00Z',
    };
    const { proposals } = planDay({
      today: todayISO(), availableMinutes: 300,
      commitments: [c], all: { k1: c },
      courseById: { c1: course }, blocksOnDay: [booked], dismissedIds: new Set(),
      startTime: '16:00', maxBlock: 90,
    });
    expect(proposals.length).toBe(0);
  });

  it('proposes only the unbooked remainder when part is booked', () => {
    const c = mkCommitment({ estimatedMinutes: 120 });
    const booked: WorkBlock = {
      id: 'b9', commitmentId: 'k1', plannedDate: todayISO(), plannedStart: '16:00',
      plannedMinutes: 60, state: 'planned', phase: 'work', reasons: [], score: 0,
      deferCount: 0, order: 0, createdAt: '2026-01-01T00:00:00Z',
    };
    const { proposals } = planDay({
      today: todayISO(), availableMinutes: 300,
      commitments: [c], all: { k1: c },
      courseById: { c1: course }, blocksOnDay: [booked], dismissedIds: new Set(),
      startTime: '16:00', maxBlock: 90,
    });
    const total = proposals.reduce((s, p) => s + p.plannedMinutes, 0);
    expect(total).toBeLessThanOrEqual(60);
  });
});

describe('reversePlan', () => {
  it('cuts phases backward from the due date, earliest first', () => {
    const c = mkCommitment({ type: 'exam', estimatedMinutes: 300, dueAt: isoAtTime(addDaysISO(todayISO(), 6), '23:59') });
    const blocks = reversePlan(c, { today: todayISO(), startTime: '16:00', maxBlock: 90 });
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    // latest block is the final check, closest to due date
    const last = blocks[blocks.length - 1];
    expect(last.phase).toBe('check');
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i].plannedDate >= blocks[i - 1].plannedDate).toBe(true);
    }
  });

  it('gives each block a reason naming the commitment', () => {
    const c = mkCommitment({ title: 'Midterm', type: 'exam', estimatedMinutes: 120 });
    const blocks = reversePlan(c, { today: todayISO(), startTime: '16:00', maxBlock: 90 });
    expect(blocks.every((b) => b.reasons[0].includes('Midterm'))).toBe(true);
  });
});

describe('missedBlocks', () => {
  it('flags past planned blocks but never touches done ones', () => {
    const mk = (patch: Partial<WorkBlock>): WorkBlock => ({
      id: 'b1', commitmentId: 'k1', plannedDate: addDaysISO(todayISO(), -1),
      plannedStart: '16:00', plannedMinutes: 60, state: 'planned', phase: 'work',
      reasons: [], score: 0, deferCount: 0, order: 0, createdAt: '2026-01-01T00:00:00Z', ...patch,
    });
    const missed = missedBlocks([mk({}), mk({ id: 'b2', state: 'done' }), mk({ id: 'b3', plannedDate: todayISO() })], todayISO());
    expect(missed.map((b) => b.id)).toEqual(['b1']);
  });
});

describe('estimateRatio', () => {
  it('computes actual/planned over completed blocks only', () => {
    const mk = (p: number, a: number | undefined): WorkBlock => ({
      id: Math.random().toString(), commitmentId: 'k1', plannedDate: todayISO(),
      plannedStart: '16:00', plannedMinutes: p, actualMinutes: a, state: 'done', phase: 'work',
      reasons: [], score: 0, deferCount: 0, order: 0, createdAt: 'x',
    });
    expect(estimateRatio([mk(60, 90), mk(60, 90), mk(60, 60)])).toBeCloseTo(80 / 60, 1);
    expect(estimateRatio([mk(60, 90)])).toBeNull();
  });
});

describe('date utils', () => {
  it('iso round-trips and diffs civil days across DST', () => {
    // US DST spring-forward weekend, 2026-03-08
    expect(addDaysISO('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDaysISO('2026-03-08', 1)).toBe('2026-03-09');
  });
});

// ── grade scenarios ──
describe('targetPercent', () => {
  it('parses letters and numbers', () => {
    expect(targetPercent('A')).toBe(93);
    expect(targetPercent('B+')).toBe(87);
    expect(targetPercent('88')).toBe(88);
    expect(targetPercent('x')).toBeNull();
    expect(targetPercent(undefined)).toBeNull();
  });
});

describe('gradeScenario', () => {
  const graded = (id: string, w: number, g: number): Commitment => ({
    id, courseId: 'c1', type: 'exam', title: id, dueAt: '2026-10-01T23:59', weight: w,
    estimatedMinutes: 60, loggedMinutes: 0, status: 'done', grade: g, pinned: false,
    dependencies: [], createdAt: '2026-09-01T00:00',
  });
  const open = (id: string, w: number): Commitment => ({
    id, courseId: 'c1', type: 'exam', title: id, dueAt: '2026-11-01T23:59', weight: w,
    estimatedMinutes: 60, loggedMinutes: 0, status: 'open', pinned: false,
    dependencies: [], createdAt: '2026-09-01T00:00',
  });

  it('computes standing and needed-on-remaining', () => {
    // 90 on 40 pts, 60 pts open, target A(93): need (93*100 - 90*40)/60 = 95
    const sc = gradeScenario([graded('a', 40, 90), open('b', 60)], 'A')!;
    expect(sc.standing).toBe(90);
    expect(sc.gradedWeight).toBe(40);
    expect(sc.remainingWeight).toBe(60);
    expect(sc.needed).toBeCloseTo(95);
    expect(sc.reachable).toBe(true);
    expect(sc.secured).toBe(false);
  });

  it('flags secured and unreachable targets', () => {
    const secured = gradeScenario([graded('a', 90, 95), open('b', 10)], 'C')!;
    expect(secured.secured).toBe(true);
    const lost = gradeScenario([graded('a', 90, 10), open('b', 10)], 'A')!;
    expect(lost.reachable).toBe(false);
  });

  it('returns null without graded items', () => {
    expect(gradeScenario([open('b', 60)], 'A')).toBeNull();
  });
});

describe('riskReason / atRisk', () => {
  it('flags work that cannot fit before its deadline', () => {
    const c = mkCommitment({ dueAt: '2026-10-15T23:59', estimatedMinutes: 360, loggedMinutes: 0 }); // ~4 fit days, 4d left → not flagged
    expect(riskReason(c, '2026-10-11', {})).toBeNull();
    const tight = mkCommitment({ dueAt: '2026-10-13T23:59', estimatedMinutes: 360, loggedMinutes: 0 }); // 4 fit days > 2d left
    expect(riskReason(tight, '2026-10-11', {})).toMatch(/work days needed/);
  });
  it('flags imminent deadlines with effort remaining', () => {
    const c = mkCommitment({ dueAt: '2026-10-12T23:59', estimatedMinutes: 60, loggedMinutes: 0 });
    expect(riskReason(c, '2026-10-11', {})).toMatch(/due in 1d/);
  });
  it('flags high-weight neglected work; stays quiet on small recent work', () => {
    const c = mkCommitment({ dueAt: '2026-10-30T23:59', weight: 25, createdAt: '2026-10-01T00:00' });
    expect(riskReason(c, '2026-10-11', {})).toMatch(/never started/);
    const small = mkCommitment({ dueAt: '2026-10-30T23:59', weight: 5, createdAt: '2026-10-01T00:00' });
    expect(riskReason(small, '2026-10-11', {})).toBeNull();
    const touched = mkCommitment({ dueAt: '2026-10-30T23:59', weight: 25, lastWorkedAt: '2026-10-10T00:00' });
    expect(riskReason(touched, '2026-10-11', {})).toBeNull();
  });
  it('skips late (red row says it) and dependency-blocked work', () => {
    const late = mkCommitment({ dueAt: '2026-10-05T23:59', estimatedMinutes: 500 });
    expect(riskReason(late, '2026-10-11', {})).toBeNull();
    const gate = mkCommitment({ id: 'k_gate', status: 'open' });
    const blocked = mkCommitment({ dueAt: '2026-10-12T23:59', dependencies: ['k_gate'] });
    expect(riskReason(blocked, '2026-10-11', { k_gate: gate })).toBeNull();
  });
});
