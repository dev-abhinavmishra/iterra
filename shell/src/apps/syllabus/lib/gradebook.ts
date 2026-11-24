import { gradeScenario, targetPercent, type GradeScenario } from './schedule';
import type { Commitment, Course } from './types';

export type GradeEntryState = 'scored' | 'invalid' | 'awaiting' | 'upcoming' | 'unweighted' | 'dropped';

export interface GradebookEntry {
  commitment: Commitment;
  state: GradeEntryState;
  countsTowardTotals: boolean;
}

export interface CourseGradebook {
  course: Course;
  entries: GradebookEntry[];
  scenario: GradeScenario | null;
  totalWeight: number;
  scoredCount: number;
  awaitingCount: number;
  invalidCount: number;
  unweightedCount: number;
  droppedCount: number;
  targetLabel: 'unset' | 'recognized' | 'unrecognized';
  targetPercent: number | null;
  requiredAverage: number | null;
}

function validScore(grade: number | undefined): boolean {
  return grade != null && Number.isFinite(grade) && grade >= 0 && grade <= 100;
}

function countsTowardTotals(commitment: Commitment): boolean {
  return commitment.status !== 'dropped' && Number.isFinite(commitment.weight) && commitment.weight > 0;
}

export function buildCourseGradebook(course: Course, commitments: Commitment[]): CourseGradebook {
  const entries = [...commitments]
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.title.localeCompare(b.title))
    .map((commitment): GradebookEntry => {
      const included = countsTowardTotals(commitment);
      const state: GradeEntryState = commitment.status === 'dropped'
        ? 'dropped'
        : !included
          ? 'unweighted'
          : validScore(commitment.grade)
            ? 'scored'
            : commitment.grade != null
              ? 'invalid'
              : commitment.status === 'done'
                ? 'awaiting'
                : 'upcoming';
      return { commitment, state, countsTowardTotals: included };
    });
  const included = entries.filter((entry) => entry.countsTowardTotals);
  const rawTarget = course.targetGrade?.trim();
  const parsedTarget = targetPercent(course.targetGrade);
  const scenario = gradeScenario(commitments, course.targetGrade);

  return {
    course,
    entries,
    scenario,
    totalWeight: included.reduce((sum, entry) => sum + entry.commitment.weight, 0),
    scoredCount: entries.filter((entry) => entry.state === 'scored').length,
    awaitingCount: entries.filter((entry) => entry.state === 'awaiting').length,
    invalidCount: entries.filter((entry) => entry.state === 'invalid').length,
    unweightedCount: entries.filter((entry) => entry.state === 'unweighted').length,
    droppedCount: entries.filter((entry) => entry.state === 'dropped').length,
    targetLabel: !rawTarget ? 'unset' : parsedTarget == null ? 'unrecognized' : 'recognized',
    targetPercent: parsedTarget,
    requiredAverage: scenario?.needed ?? (!scenario && parsedTarget != null && included.length > 0 ? parsedTarget : null),
  };
}

/** Round a required mark upward so the displayed threshold never understates it. */
export function formatRequiredAverage(value: number): string {
  const rounded = Math.ceil(value * 10 - 1e-9) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
