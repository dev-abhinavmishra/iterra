import { describe, expect, it } from 'vitest';
import { buildCourseGradebook, formatRequiredAverage } from './gradebook';
import type { Commitment, Course } from './types';

const course: Course = {
  id: 'course-1', termId: 'term-1', name: 'History', code: 'HIST 101', color: 'navy',
  targetGrade: 'A', archived: false, createdAt: '2026-01-01T00:00:00.000Z',
};

function commitment(id: string, options: Partial<Commitment> = {}): Commitment {
  return {
    id, courseId: course.id, type: 'assignment', title: id, dueAt: '2026-03-01T23:59:00.000Z',
    weight: 10, estimatedMinutes: 60, loggedMinutes: 0, status: 'open', pinned: false,
    dependencies: [], createdAt: '2026-01-01T00:00:00.000Z', ...options,
  };
}

describe('buildCourseGradebook', () => {
  it('separates scored, upcoming, filed awaiting grade, unweighted, and dropped records', () => {
    const model = buildCourseGradebook(course, [
      commitment('zero', { grade: 0, weight: 30 }),
      commitment('upcoming', { weight: 20 }),
      commitment('awaiting', { status: 'done', weight: 25 }),
      commitment('unweighted', { weight: 0, grade: 100 }),
      commitment('dropped', { status: 'dropped', grade: 100, weight: 25 }),
    ]);

    expect(model.entries.map(({ commitment: item, state }) => [item.id, state])).toEqual([
      ['awaiting', 'awaiting'], ['dropped', 'dropped'], ['unweighted', 'unweighted'],
      ['upcoming', 'upcoming'], ['zero', 'scored'],
    ]);
    expect(model.totalWeight).toBe(75);
    expect(model.scoredCount).toBe(1);
    expect(model.awaitingCount).toBe(1);
    expect(model.unweightedCount).toBe(1);
    expect(model.droppedCount).toBe(1);
    expect(model.scenario).toMatchObject({ standing: 0, gradedWeight: 30, remainingWeight: 45 });
  });

  it('makes the no-scores, no-target, and unrecognized-target states explicit', () => {
    const noScores = buildCourseGradebook(course, [commitment('awaiting', { status: 'done' })]);
    expect(noScores.scenario).toBeNull();
    expect(noScores.totalWeight).toBe(10);
    expect(noScores.targetLabel).toBe('recognized');
    expect(noScores.targetPercent).toBe(93);
    expect(noScores.requiredAverage).toBe(93);

    const noTarget = buildCourseGradebook({ ...course, targetGrade: undefined }, [commitment('graded', { grade: 80 })]);
    expect(noTarget.targetLabel).toBe('unset');
    expect(noTarget.targetPercent).toBeNull();
    expect(noTarget.scenario?.target).toBeNull();

    const invalidTarget = buildCourseGradebook({ ...course, targetGrade: 'Pass' }, [commitment('graded', { grade: 80 })]);
    expect(invalidTarget.targetLabel).toBe('unrecognized');
    expect(invalidTarget.scenario?.target).toBeNull();

    const outOfRangeTarget = buildCourseGradebook({ ...course, targetGrade: '150' }, [commitment('graded', { grade: 80 })]);
    expect(outOfRangeTarget.targetLabel).toBe('unrecognized');
    expect(outOfRangeTarget.targetPercent).toBeNull();

    const zeroTarget = buildCourseGradebook({ ...course, targetGrade: '0' }, [commitment('graded', { grade: 0 })]);
    expect(zeroTarget.targetLabel).toBe('recognized');
    expect(zeroTarget.targetPercent).toBe(0);
  });

  it('does not let invalid scores or non-finite weights affect totals', () => {
    const model = buildCourseGradebook(course, [
      commitment('scored', { grade: 80, weight: 20 }),
      commitment('invalid-score', { grade: Number.NaN, weight: 10 }),
      commitment('invalid-weight', { grade: 90, weight: Number.POSITIVE_INFINITY }),
    ]);
    expect(model.totalWeight).toBe(30);
    expect(model.scenario).toMatchObject({ standing: 80, gradedWeight: 20, remainingWeight: 10 });
    expect(model.entries.find((entry) => entry.commitment.id === 'invalid-score')?.state).toBe('invalid');
    expect(model.entries.find((entry) => entry.commitment.id === 'invalid-weight')?.state).toBe('unweighted');
  });

  it('preserves aggregate weights above 100 and never rounds a required mark down', () => {
    const model = buildCourseGradebook({ ...course, targetGrade: 'B' }, [
      commitment('graded-one', { grade: 90, weight: 80 }),
      commitment('graded-two', { grade: 80, weight: 80 }),
      commitment('remaining', { weight: 40 }),
    ]);
    expect(model.totalWeight).toBe(200);
    expect(model.scenario).toMatchObject({ standing: 85, gradedWeight: 160, remainingWeight: 40, needed: 75 });
    expect(formatRequiredAverage(95.04)).toBe('95.1');
    expect(formatRequiredAverage(95.00000000000001)).toBe('95');
  });
});
