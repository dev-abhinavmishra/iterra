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
