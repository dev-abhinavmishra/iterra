// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { handleCreateTargetedReview } from './commands';
import type { Scan, Test } from '../apps/gradestack/store';

const baseTest: Test = {
  id: 'exam',
  name: 'Intro chemistry',
  courseName: 'Chemistry',
  date: '2026-11-18',
  numQuestions: 3,
  format: 'A-D',
  includeStudentId: false,
  answerKey: { 1: 'C', 2: 'B', 3: 'A' },
  questionTopics: { 1: 'Equilibrium', 3: 'Kinetics' },
};

const scan: Scan = {
  id: 's1',
  testId: 'exam',
  studentId: 'st',
  studentName: 'Sam',
  rawScore: 1,
  maxScore: 3,
  percentage: 33,
  grade: 'D',
  needsReview: false,
  responses: { 1: 'A', 2: 'B', 3: 'C' },
};

function seed(test: Test = baseTest) {
  localStorage.setItem('gradestack-storage', JSON.stringify({
    state: { tests: [test], scans: [scan] },
    version: 1,
  }));
}

function deckCards(): any[] {
  const decks = JSON.parse(localStorage.getItem('cardfile.decks.v1') || '{}');
  return Object.values(decks).flatMap((deck: any) => deck.cards || []);
}

describe('createTargetedReview card prompts', () => {
  beforeEach(() => {
    localStorage.clear();
    seed();
  });

  it('refuses to synthesize bare "Q → letter" deck cards when prompts are missing', async () => {
    const result = await handleCreateTargetedReview({
      assessmentRef: 'gradestack:assessment:exam',
      selectedQuestions: [1, 3],
      scanIds: ['s1'],
      reviewKind: 'flashcards-deck',
      course: 'Chemistry',
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('REVIEW_PROMPTS_REQUIRED');
    expect(result.error).toContain('1');
    expect(deckCards()).toHaveLength(0);
  });

  it('still allows a syllabus-block-only review without prompts', async () => {
    const result = await handleCreateTargetedReview({
      assessmentRef: 'gradestack:assessment:exam',
      selectedQuestions: [1],
      selectedTopics: ['Equilibrium'],
      scanIds: ['s1'],
      reviewKind: 'syllabus-block',
      course: 'Chemistry',
    });
    expect(result.code).not.toBe('REVIEW_PROMPTS_REQUIRED');
  });

  it('builds practicable cards from questionPrompts with a why-focused back', async () => {
    seed({
      ...baseTest,
      questionPrompts: {
        1: 'Which expression gives the equilibrium constant?',
        3: 'What happens to the rate when temperature doubles?',
      },
    });
    const result = await handleCreateTargetedReview({
      assessmentRef: 'gradestack:assessment:exam',
      selectedQuestions: [1, 3],
      scanIds: ['s1'],
      reviewKind: 'flashcards-deck',
      course: 'Chemistry',
    });
    expect(result.ok).toBe(true);
    const cards = deckCards();
    expect(cards).toHaveLength(2);
    const q1 = cards.find(card => card.q.includes('equilibrium constant'));
    expect(q1).toBeDefined();
    expect(q1.q).toContain('Question 1 · Equilibrium');
    expect(q1.a).toContain('Answer: C');
    expect(q1.a).toContain('Why is this answer correct?');
    expect(q1.ex).toContain('Intro chemistry');
  });

  it('honors explicit card candidates without requiring prompts', async () => {
    const result = await handleCreateTargetedReview({
      assessmentRef: 'gradestack:assessment:exam',
      selectedQuestions: [1],
      scanIds: ['s1'],
      reviewKind: 'flashcards-deck',
      course: 'Chemistry',
      cards: [{ q: 'Edited prompt for Q1', a: 'Answer: C\nWhy is this answer correct?' }],
    });
    expect(result.ok).toBe(true);
    expect(deckCards().some(card => card.q === 'Edited prompt for Q1')).toBe(true);
  });
});
