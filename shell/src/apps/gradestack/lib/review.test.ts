import { expect, it } from 'vitest';
import type { Scan, Test } from '../store';
import { questionResults, reviewQuestions } from './review';

const test: Test = {
  id: 'exam', name: 'Intro chemistry', date: '2026-11-18', numQuestions: 6, format: 'A-D', includeStudentId: false,
  answerKey: { 1: 'C', 2: 'A,C', 3: 'B', 4: 'B', 6: '?' },
  questionTopics: { 1: 'Equilibrium', 2: 'Bonding', 3: 'Kinetics', 5: 'Acids' },
};
const sheet = (id: string, responses: Scan['responses'], fields: Partial<Scan> = {}): Scan => ({
  id, testId: 'exam', studentId: 'student', studentName: 'Student',
  rawScore: 0, maxScore: 6, percentage: 0, grade: 'F', needsReview: false, responses, ...fields,
});

it('ranks known misses and ignores matched, unreadable, unkeyed and unconfirmed marks', () => {
  const scans = [
    sheet('one', { 1: 'A', 2: 'c,a', 3: '?', 4: 'B', 5: 'C', 6: 'C' }),
    sheet('two', { 1: 'C', 2: 'C', 3: 'A' }),
    sheet('flagged', { 4: 'C' }, { needsReview: true }),
    sheet('other', { 4: 'C' }, { testId: 'other-assessment' }),
  ];
  expect(reviewQuestions(test, scans)).toEqual([
    { number: 3, answer: 'B', answered: 1, missed: 1, topic: 'Kinetics' },
    { number: 1, answer: 'C', answered: 2, missed: 1, topic: 'Equilibrium' },
    { number: 2, answer: 'A,C', answered: 2, missed: 1, topic: 'Bonding' },
  ]);
  expect(reviewQuestions(test, [scans[0]]).map(question => question.number)).toEqual([1]);
  expect(questionResults(test, scans).map(question => [question.number, question.answered, question.missed]))
    .toEqual([[3, 1, 1], [1, 2, 1], [2, 2, 1], [4, 1, 0]]);
});

it('leaves a score without readable question marks for manual topic review', () => {
  expect(reviewQuestions(test, [sheet('score-only', undefined, { percentage: 30 })])).toEqual([]);
});
