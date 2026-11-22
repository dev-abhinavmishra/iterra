import { describe, expect, it } from 'vitest';
import type { StoreEntity } from '../hub';
import { buildStudyPlan } from './studyPlan';

const now = Date.parse('2026-11-18T18:00:00Z');
const day = 86_400_000;
const bio: StoreEntity = { key: 'syllabus:course:b', app: 'syllabus', type: 'course', id: 'b', course: 'BIO 101', title: 'Biology' };
const math: StoreEntity = { key: 'syllabus:course:m', app: 'syllabus', type: 'course', id: 'm', course: 'MATH 201' };

function row(app: string, type: string, id: string, data: StoreEntity['data'], course = bio): StoreEntity {
  return { key: `${app}:${type}:${id}`, app, type, id, data, courseId: course.key, course: course.course, title: id };
}

describe('study session planning', () => {
  it('prioritizes the urgent course and uses specific, time-budgeted work from four tools', () => {
    const assignment = row('syllabus', 'commitment', 'Cell lab', { status: 'open', dueAt: new Date(now + 600_000).toISOString() });
    const deck = row('flashcards', 'deck', 'Cell vocabulary', { due: 12 });
    const problem = row('proof', 'problem', 'Calculate the rate', { dueAt: now - day });
    const note = { ...row('ink', 'note', 'Cell notes', {}), url: '/apps/ink/?p=note%2Fid' };
    const distant = row('syllabus', 'commitment', 'Math set', { status: 'open', dueAt: now + 9 * day }, math);
    const rows = [bio, math, distant, assignment, deck, problem, note];
    const before = structuredClone(rows);
    const plan = buildStudyPlan(rows, { now, minutes: 25 })!;
    expect(plan.course.key).toBe(bio.key);
    expect(plan.courseQueue.map(entry => [entry.course.key, entry.openTasks, entry.dueCards, entry.dueProblems]))
      .toEqual([[bio.key, 1, 12, 1], [math.key, 1, 0, 0]]);
    expect(plan.steps.map(step => step.id)).toEqual([assignment.key, deck.key, problem.key, note.key]);
    expect(plan.steps.map(step => step.url)).toEqual([
      '/apps/syllabus/?commitment=Cell%20lab', '/apps/flashcards/?deck=Cell%20vocabulary&p=learn',
      '/apps/proof/?problem=Calculate%20the%20rate', note.url,
    ]);
    expect(plan.steps.reduce((sum, step) => sum + step.minutes, 0)).toBe(25);
    expect(plan.steps.every(step => step.minutes >= 5)).toBe(true);
    expect(rows).toEqual(before);
  });

  it('keeps selected and linked work in its own course and avoids crediting closed work', () => {
    const closed = row('syllabus', 'commitment', 'Finished', { status: 'done', dueAt: now }, math);
    const deck = row('flashcards', 'deck', 'Linked deck', { due: 0 }, math);
    const foreign = row('flashcards', 'deck', 'Other course', { due: 100 });
    const plan = buildStudyPlan([bio, math, closed, deck, foreign], {
      now, minutes: 3, courseRef: 'math201', commitmentId: closed.id, materialRef: deck.key,
    })!;
    expect(plan.commitmentId).toBeUndefined();
    expect(plan.steps).toMatchObject([{ id: deck.key, minutes: 3 }]);
  });

  it('uses the latest graded attempt and avoids sending completed review work back into a plan', () => {
    const problem = row('proof', 'problem', 'Equation', {});
    const wrong = { ...row('proof', 'attempt', 'Wrong', { problemId: problem.id, result: 'incorrect' }), createdAt: now - day };
    const correct = { ...row('proof', 'attempt', 'Right', { problemId: problem.id, result: 'correct' }), createdAt: now };
    expect(buildStudyPlan([bio, problem, wrong], { now, minutes: 10 })!.steps[0].id).toBe(problem.key);
    expect(buildStudyPlan([bio, problem, wrong, correct], { now, minutes: 10 })!.steps.map(s => s.id))
      .toEqual(['schedule', 'plan']);
  });

  it('carries forward unfinished work only for its own course while the tool still reports it due', () => {
    const original = row('flashcards', 'deck', 'Original', { due: 2 });
    const newlyDue = row('flashcards', 'deck', 'Newly due', { due: 20 });
    const dueTask = row('syllabus', 'commitment', 'Due assignment', { status: 'open', dueAt: now });
    const unfinished = { courseKey: bio.key, stepIds: [original.key] };
    const plan = buildStudyPlan([bio, original, newlyDue, dueTask], { now, minutes: 25, unfinished })!;
    expect(plan.steps.map(step => step.id)).toEqual([dueTask.key, original.key]);
    expect(plan.steps[1].detail).toMatch('From your last session.');
    const reviewed = { ...original, data: { due: 0 } };
    expect(buildStudyPlan([bio, reviewed, newlyDue], { now, minutes: 25, unfinished })!.steps[0].id)
      .toBe(newlyDue.key);
    expect(buildStudyPlan([bio, original, newlyDue], {
      now, minutes: 25, unfinished: { ...unfinished, courseKey: math.key },
    })!.steps[0].id).toBe(newlyDue.key);
  });

  it('does not infer a course from a shared code but keeps explicitly linked items', () => {
    const duplicate = { ...math, course: bio.course };
    const unassigned = { ...row('flashcards', 'deck', 'Unassigned', { due: 50 }), courseId: undefined };
    const exact = row('flashcards', 'deck', 'Exact', { due: 3 });
    expect(buildStudyPlan([bio, duplicate, unassigned, exact], { now, minutes: 25, courseRef: bio.key })!.steps[0].id)
      .toBe(exact.key);
    expect(buildStudyPlan([bio, duplicate, unassigned, exact], { now, minutes: 25, courseRef: duplicate.key })!.setup)
      .toBe(true);
  });

  it('gives a new course actionable setup steps without fabricating assignments or study materials', () => {
    expect(buildStudyPlan([], { now, minutes: 25 })).toBeNull();
    const archived = { ...math, data: { archived: true } };
    expect(buildStudyPlan([bio, archived], { now, minutes: 25, courseRef: archived.key })).toBeNull();
    const plan = buildStudyPlan([bio, archived], { now, minutes: 25 })!;
    expect(plan.setup).toBe(true);
    expect(plan.steps.map(step => step.url)).toEqual(['/apps/syllabus/?importSchedule=b', '/apps/syllabus/?addAssignment=b', '#/c/BIO%20101']);
    expect(plan.commitmentId).toBeUndefined();
  });
});
