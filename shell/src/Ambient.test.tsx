// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { StoreEntity } from './hub';
import { Ambient } from './Ambient';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let previousIterra: unknown;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  previousIterra = (window as any).iterra;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  if (previousIterra === undefined) delete (window as any).iterra;
  else (window as any).iterra = previousIterra;
  vi.unstubAllGlobals();
});

function session(id: string, createdAt: number, title: string): StoreEntity {
  return {
    id,
    key: `timer:session:${id}`,
    app: 'timer',
    type: 'session',
    title,
    createdAt,
    data: { minutes: 25 },
  };
}

function render(entityState: 'loading' | 'ready' | 'error', entities: StoreEntity[]) {
  act(() => root.render(
    <Ambient
      entities={entities}
      entityState={entityState}
      onGo={vi.fn()}
      activePlace="syllabus"
    />,
  ));
}

it('baselines the ready snapshot instead of announcing persisted session history', () => {
  const now = Date.now();
  const persistedRecent = session('persisted-recent', now, 'Saved focus session');
  const persistedHistory = session('persisted-history', now - 24 * 60 * 60 * 1000, 'Older focus session');

  render('loading', []);
  render('ready', [persistedRecent, persistedHistory]);

  expect(host.textContent).toBe('');
});

it('announces a newly completed recent session but suppresses demo and historical inserts', () => {
  const now = Date.now();
  const historical = session('imported-history', now - 60 * 60 * 1000, 'Imported old session');
  const demo = session('demo-session', now, 'Sample focus session');
  const live = session('live-session', now, 'Chapter review');

  render('ready', []);
  render('ready', [historical, demo]);
  expect(host.textContent).toBe('');

  render('ready', [historical, demo, live]);
  expect(host.textContent).toContain('Chapter review · 25m logged');
  expect(host.textContent).not.toContain('Sample focus session');
  expect(host.textContent).not.toContain('Imported old session');
});

it('announces a genuine completion during entity hydration and deduplicates its later entity insert', () => {
  const handlers = new Map<string, (record: any) => void>();
  Object.defineProperty(window, 'iterra', {
    configurable: true,
    value: {
      events: {
        on: vi.fn((name: string, handler: (record: any) => void) => {
          handlers.set(name, handler);
          return () => handlers.delete(name);
        }),
      },
    },
  });

  render('loading', []);
  act(() => handlers.get('session.completed')?.({
    payload: {
      sessionId: 'live-during-hydration', minutes: 40,
      text: 'focus · 40m — Inference practice', url: '/apps/timer/?p=stats',
    },
  }));
  expect(host.textContent).toContain('Inference practice · 40m logged');

  render('ready', [session('live-during-hydration', Date.now(), 'Inference practice')]);
  expect(host.querySelectorAll('.it-ambient button')).toHaveLength(1);
});
