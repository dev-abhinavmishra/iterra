// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { StoreEntity } from '../hub';
import { TodayWorkspace, type TodayWorkspaceProps } from './TodayWorkspace';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function block(id: string, dueAt: number, data: StoreEntity['data']): StoreEntity {
  return {
    id,
    key: `syllabus:block:${id}`,
    app: 'syllabus',
    type: 'block',
    title: 'Review the chapter',
    course: 'BIO 101',
    courseId: 'syllabus:course:bio',
    url: `/apps/syllabus/?block=${id}`,
    data: { ...data, dueAt },
  };
}

function startFocus(overrides: Partial<TodayWorkspaceProps>, label: string) {
  const onGo = vi.fn<(url: string) => void>();
  act(() => {
    root.render(
      <TodayWorkspace presences={{}} shared={{}} indexes={{}} entities={[]} feed={[]}
        onEnter={vi.fn()} onGo={onGo} {...overrides} />,
    );
  });
  const action = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes(label));
  expect(action).toBeDefined();
  act(() => action?.click());
  expect(onGo).toHaveBeenCalledOnce();
  return new URL(onGo.mock.calls[0][0], 'https://iterra.test');
}

it('puts course setup first for new students and keeps that guidance for saved unfiled work', () => {
  const onEnter = vi.fn<(id: string) => void>();
  const render = (entities: StoreEntity[] = []) => act(() => {
    root.render(
      <TodayWorkspace presences={{}} shared={{}} indexes={{}} entities={entities} feed={[]}
        onEnter={onEnter} onGo={vi.fn()} />,
    );
  });
  const primary = (button: HTMLButtonElement) => button.className.includes('bg-[var(--color-accent)]');

  render();
  const starter = host.querySelector<HTMLElement>('[aria-label="Get started"]');
  expect(starter?.textContent).toContain('Start with your courses');
  expect(starter?.parentElement?.className).toContain('lg:col-span-7');
  expect(host.querySelector('[aria-label="Review and follow-up"]')?.parentElement?.className)
    .toContain('lg:col-span-5');
  const setup = [...(starter?.querySelectorAll('button') ?? [])]
    .find(button => button.textContent?.includes('Set Up Courses')) as HTMLButtonElement | undefined;
  expect(setup).toBeDefined();
  expect(primary(setup!)).toBe(true);
  expect(primary([...starter!.querySelectorAll('button')]
    .find(button => button.textContent?.includes('New Note')) as HTMLButtonElement)).toBe(false);

  const addTask = [...host.querySelectorAll('button')]
    .find(button => button.textContent?.includes('Add a Study Task in Planning')) as HTMLButtonElement;
  const addCourses = [...host.querySelectorAll('button')]
    .find(button => button.textContent?.includes('Add Courses in Planning')) as HTMLButtonElement;
  expect(primary(addTask)).toBe(false);
  expect(primary(addCourses)).toBe(false);
  act(() => setup!.click());
  expect(onEnter).toHaveBeenCalledWith('syllabus');

  render([{
    id: 'saved-note', key: 'ink:note:saved-note', app: 'ink', type: 'note',
    title: 'Biology notes', url: '/apps/ink/?note=saved-note', data: {}, updatedAt: Date.now(),
  }]);
  const savedWorkResume = host.querySelector<HTMLElement>('[aria-label="Pick up where you left off"]');
  expect(savedWorkResume?.textContent).toContain('Biology notes');
  expect(savedWorkResume?.textContent).toContain('Set up courses to organize this saved work');
  const savedSetup = [...savedWorkResume!.querySelectorAll('button')]
    .find(button => button.textContent?.includes('Set Up Courses')) as HTMLButtonElement;
  const continueWork = [...savedWorkResume!.querySelectorAll('button')]
    .find(button => button.textContent?.includes('Continue in')) as HTMLButtonElement;
  expect(primary(savedSetup)).toBe(false);
  expect(primary(continueWork)).toBe(true);
});

it('expands review and course overview when courses exist but the left column has no content', () => {
  const course: StoreEntity = {
    id: 'bio-course', key: 'syllabus:course:bio', app: 'syllabus', type: 'course',
    title: 'BIO 101', course: 'BIO 101', data: { code: 'BIO 101' },
  };
  act(() => {
    root.render(
      <TodayWorkspace presences={{}} shared={{}} indexes={{}} entities={[course]} feed={[]}
        onEnter={vi.fn()} onGo={vi.fn()} />,
    );
  });

  expect(host.querySelector('[aria-label="Get started"]')).toBeNull();
  expect(host.querySelector('[aria-label="Pick up where you left off"]')).toBeNull();
  expect(host.querySelector('[aria-label="Next up scheduled work"]')).toBeNull();
  expect(host.querySelector('[aria-label="Recent work"]')).toBeNull();

  const review = host.querySelector<HTMLElement>('[aria-label="Review and follow-up"]')!;
  const courseOverview = host.querySelector<HTMLElement>('[aria-label="Course overview"]')!;
  const rightColumn = review.parentElement!;
  expect(rightColumn.className).toContain('lg:col-span-12');
  expect(rightColumn.className).toContain('lg:grid-cols-2');
  expect(courseOverview.parentElement).toBe(rightColumn);
  expect(rightColumn.parentElement?.children).toHaveLength(1);
  expect(review.compareDocumentPosition(courseOverview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it('launches the exact scheduled block with canonical duration and course and commitment bindings', () => {
  const now = Date.now();
  const url = startFocus({
    shared: { today: {
      by: 'test',
      at: now,
      v: { nextBlock: { id: 'correct', title: 'Review the chapter', course: 'BIO 101', minutes: 25 } },
    } },
    entities: [
      block('same-title', now + 10_000, { plannedMinutes: 10, commitmentId: 'other-commitment' }),
      block('correct', now + 20_000, { plannedMinutes: 45, commitmentId: 'correct-commitment' }),
    ],
  }, 'Start 45m Focus');
  expect(url.pathname).toBe('/apps/timer/');
  expect(url.searchParams.get('block')).toBe('correct');
  expect(url.searchParams.get('minutes')).toBe('45');
  expect(url.searchParams.get('commitment')).toBe('correct-commitment');
  expect(url.searchParams.get('course')).toBe('BIO 101');
  expect(url.searchParams.get('courseId')).toBe('syllabus:course:bio');
});

it('preserves the published binding when its canonical block has not loaded', () => {
  const now = Date.now();
  const url = startFocus({
    shared: { today: {
      by: 'test',
      at: now,
      v: { nextBlock: {
        id: 'published',
        title: 'Review the chapter',
        course: 'BIO 101',
        courseId: 'syllabus:course:bio',
        minutes: 35,
        commitmentId: 'published-commitment',
      } },
    } },
    entities: [block('same-title', now + 10_000, { minutes: 20, commitmentId: 'other-commitment' })],
  }, 'Start 35m Focus');
  expect(url.searchParams.get('block')).toBe('published');
  expect(url.searchParams.get('commitment')).toBe('published-commitment');
  expect(url.searchParams.get('courseId')).toBe('syllabus:course:bio');
});
