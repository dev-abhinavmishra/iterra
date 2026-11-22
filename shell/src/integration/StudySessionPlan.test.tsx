// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { StoreEntity } from '../hub';
import { ActiveStudyPlan, StudyEntities } from './StudySessionPlan';
import { STUDY_SESSION_KEY } from './studySessionState';

it('keeps the active steps and legacy checkmarks when due work changes and Timer remounts', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const course: StoreEntity = { key: 'syllabus:course:bio', app: 'syllabus', type: 'course', id: 'bio', course: 'BIO' };
  const deck: StoreEntity = {
    key: 'flashcards:deck:bio', app: 'flashcards', type: 'deck', id: 'bio', title: 'Vocabulary',
    courseId: course.key, data: { due: 10 },
  };
  const assignment: StoreEntity = {
    key: 'syllabus:commitment:lab', app: 'syllabus', type: 'commitment', id: 'lab', title: 'Lab',
    courseId: course.key, data: { status: 'open' },
  };
  const checked = () => host.querySelector<HTMLInputElement>('input[aria-label="Mark complete: Work on: Lab"]')?.checked;
  const render = (entities: StoreEntity[], sessionKey = 'live') => {
    act(() => root.render(
      <StudyEntities.Provider value={entities}>
        <ActiveStudyPlan minutes={25} sessionKey={sessionKey} courseRef={course.key} />
      </StudyEntities.Provider>,
    ));
  };

  localStorage.setItem(STUDY_SESSION_KEY, JSON.stringify({ sessionKey: 'live', checked: [assignment.key] }));
  try {
    render([course, deck, assignment]);
    expect(checked()).toBe(true);
    expect(host.textContent).toContain('Review cards: Vocabulary');
    const reviewed = { ...deck, data: { due: 0 } };
    render([course, reviewed, assignment]);
    expect(host.textContent).toContain('Review cards: Vocabulary');
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Completed in its tool: Review cards: Vocabulary"]')?.checked)
      .toBe(true);
    expect(host.textContent).toContain('Review complete in Flashcards.');
    expect(host.textContent).not.toContain('10 to review.');
    act(() => root.render(null));
    render([course, reviewed, assignment]);
    expect(host.textContent).toContain('Review cards: Vocabulary');
    expect(checked()).toBe(true);
    render([course, reviewed, assignment], 'next');
    expect(host.textContent).not.toContain('Review cards: Vocabulary');
    expect(checked()).toBe(false);
  } finally {
    act(() => root.unmount());
    host.remove();
    localStorage.removeItem(STUDY_SESSION_KEY);
    vi.unstubAllGlobals();
  }
});
