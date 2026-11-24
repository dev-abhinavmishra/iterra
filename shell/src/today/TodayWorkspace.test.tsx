// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { StoreEntity } from '../hub';
import type { WorkspaceObject } from '../ui/ObjectRow';
import { execCommand } from '../integration/commands';
import { TodayWorkspace, type TodayWorkspaceProps } from './TodayWorkspace';

vi.mock('../integration/commands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../integration/commands')>();
  return { ...actual, execCommand: vi.fn() };
});
const execCommandMock = execCommand as unknown as ReturnType<typeof vi.fn>;

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  execCommandMock.mockReset();
  execCommandMock.mockResolvedValue({
    ok: true,
    commandId: 'cmd-test',
    data: { commitmentId: 'k_new', course: 'BIO 101' },
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function render(overrides: Partial<TodayWorkspaceProps> = {}) {
  const onEnter = vi.fn<(id: string) => void>();
  const onGo = vi.fn<(url: string) => void>();
  const onSelectObject = vi.fn<(obj: WorkspaceObject) => void>();
  act(() => {
    root.render(
      <TodayWorkspace presences={{}} shared={{}} indexes={{}} entities={[]} feed={[]}
        onEnter={onEnter} onGo={onGo} onSelectObject={onSelectObject} {...overrides} />,
    );
  });
  return { onEnter, onGo, onSelectObject };
}

function buttonWith(text: string, scope: ParentNode = host): HTMLButtonElement | undefined {
  return [...scope.querySelectorAll('button')].find((b) => b.textContent?.includes(text));
}

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function clickTab(view: string) {
  const tab = host.querySelector<HTMLButtonElement>(`[role="tab"][data-view="${view}"]`);
  expect(tab).not.toBeNull();
  act(() => tab!.click());
  return tab!;
}

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

function course(id = 'c1', code = 'BIO 101'): StoreEntity {
  return {
    id,
    key: `syllabus:course:${id}`,
    app: 'syllabus',
    type: 'course',
    title: 'Biology',
    course: code,
    url: '/apps/syllabus/',
    data: { code },
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
  const action = buttonWith(label);
  expect(action).toBeDefined();
  act(() => action?.click());
  expect(onGo).toHaveBeenCalledOnce();
  return new URL(onGo.mock.calls[0][0], 'https://iterra.test');
}

it('renders journal chrome with accessible tabs and switches views', () => {
  render();

  expect(host.querySelector('.today-journal')).not.toBeNull();
  expect(host.querySelector('.today-masthead .today-greeting')).not.toBeNull();
  const tablist = host.querySelector('[role="tablist"][aria-label="Today views"]');
  expect(tablist).not.toBeNull();
  const tabs = [...tablist!.querySelectorAll<HTMLElement>('[role="tab"]')];
  expect(tabs.map((t) => t.dataset.view)).toEqual(['day', 'plans', 'journal', 'courses', 'tools']);
  expect(tabs[0].getAttribute('aria-selected')).toBe('true');
  expect(tabs[0].tabIndex).toBe(0);
  for (const tab of tabs.slice(1)) {
    expect(tab.getAttribute('aria-selected')).toBe('false');
    expect(tab.tabIndex).toBe(-1);
    expect(tab.getAttribute('aria-controls')).toBe('today-panel');
  }
  const panel = host.querySelector('#today-panel');
  expect(panel?.getAttribute('aria-labelledby')).toBe('today-tab-day');

  act(() => {
    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  });
  const plansTab = host.querySelector<HTMLElement>('[role="tab"][data-view="plans"]');
  expect(plansTab?.getAttribute('aria-selected')).toBe('true');
  expect(document.activeElement).toBe(plansTab);
  expect(host.querySelector('#today-panel')?.getAttribute('aria-labelledby')).toBe('today-tab-plans');
  expect(host.querySelector('[aria-label="Session planner"]')).not.toBeNull();

  clickTab('journal');
  expect(host.querySelector('#today-panel')?.getAttribute('aria-labelledby')).toBe('today-tab-journal');
  expect(host.querySelector('[aria-label="Recent work"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="Recent workspace activity"]')).not.toBeNull();

  clickTab('courses');
  expect(host.querySelector('[aria-label="Course overview"]')).not.toBeNull();

  clickTab('tools');
  expect(host.querySelector('[aria-label="Workspace tools"]')).not.toBeNull();
  expect(host.querySelectorAll('.today-tool-card')).toHaveLength(9);
});

it('keeps a single page heading and one masthead fleuron', () => {
  render();
  const headings = host.querySelectorAll('h1');
  expect(headings).toHaveLength(1);
  expect(headings[0].className).toBe('today-greeting');
  /* the fleuron lives on .today-masthead::after — no literal duplicate span */
  expect(host.querySelector('.today-masthead-mark')).toBeNull();
});

it('keeps first-assignment entry primary and secondary starts behind disclosure', () => {
  const { onEnter, onGo } = render();
  const starter = host.querySelector<HTMLElement>('[aria-label="Get started"]');
  expect(starter?.textContent).toContain('Add your first assignment');
  const primary = (button: HTMLButtonElement | undefined) =>
    !!button && button.className.includes('bg-[var(--color-accent)]');

  const addAssignment = buttonWith('Add your first assignment', starter!);
  const setup = buttonWith('Set up courses', starter!);
  expect(primary(addAssignment)).toBe(true);
  expect(primary(setup)).toBe(false);
  act(() => setup!.click());
  expect(onEnter).toHaveBeenCalledWith('syllabus');

  const disclosure = buttonWith('Other ways to start', starter!);
  expect(disclosure).toBeDefined();
  act(() => disclosure!.click());
  const newNote = buttonWith('New note', starter!);
  const addTask = buttonWith('Add a study task', starter!);
  const sample = buttonWith('Load sample semester', starter!);
  expect(primary(newNote)).toBe(false);
  expect(primary(addTask)).toBe(false);
  expect(primary(sample)).toBe(false);
  act(() => newNote!.click());
  expect(onEnter).toHaveBeenCalledWith('ink');
  act(() => addTask!.click());
  expect(onGo).toHaveBeenCalledWith('#/p/syllabus?p=today');

  const saved = render({
    entities: [{
      id: 'saved-note', key: 'ink:note:saved-note', app: 'ink', type: 'note',
      title: 'Biology notes', url: '/apps/ink/?note=saved-note', data: {}, updatedAt: Date.now(),
    }],
  });
  const resume = host.querySelector<HTMLElement>('[aria-label="Pick up where you left off"]');
  expect(resume?.textContent).toContain('Biology notes');
  expect(resume?.textContent).toContain('Set up courses to organize this saved work');
  const continueWork = buttonWith('Continue in Notes', resume!);
  const savedSetup = buttonWith('Set up courses', resume!);
  expect(primary(continueWork)).toBe(true);
  expect(primary(savedSetup)).toBe(false);
  act(() => savedSetup!.click());
  expect(saved.onEnter).toHaveBeenCalledWith('syllabus');
  act(() => continueWork!.click());
  expect(saved.onSelectObject).toHaveBeenCalledOnce();
  expect(saved.onGo).toHaveBeenCalledWith('/apps/ink/?note=saved-note');
});

it('files a first assignment through the syllabus commitment command', async () => {
  render();
  const starter = host.querySelector<HTMLElement>('[aria-label="Get started"]');
  act(() => buttonWith('Add your first assignment', starter!)!.click());

  const dialog = host.querySelector<HTMLElement>('[role="dialog"]');
  expect(dialog?.getAttribute('aria-label')).toBe('Add your first assignment');
  const due = localISODate(4);
  setInput(dialog!.querySelector<HTMLInputElement>('input[aria-label="Assignment title"]')!, 'Biology quiz');
  setInput(dialog!.querySelector<HTMLInputElement>('input[aria-label="Course"]')!, 'BIO 101');
  setInput(dialog!.querySelector<HTMLInputElement>('input[aria-label="Due date"]')!, due);
  setInput(dialog!.querySelector<HTMLInputElement>('input[aria-label="Estimate minutes"]')!, '45');

  await act(async () => {
    buttonWith('Add assignment', dialog!)!.click();
  });

  expect(execCommandMock).toHaveBeenCalledWith('createCommitment', {
    title: 'Biology quiz',
    course: 'BIO 101',
    dueDate: due,
    estimatedMinutes: 45,
  });
  expect(host.querySelector('[role="dialog"]')).toBeNull();
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
  }, 'Start BIO 101 · 45 min');
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
  }, 'Start BIO 101 · 35 min');
  expect(url.searchParams.get('block')).toBe('published');
  expect(url.searchParams.get('commitment')).toBe('published-commitment');
  expect(url.searchParams.get('courseId')).toBe('syllabus:course:bio');
});

it('keeps the weekly ledger visible for titleless session entities instead of collapsing to first-run', () => {
  render({
    entities: [{
      id: 'sess-1',
      key: 'timer:session:sess-1',
      app: 'timer',
      type: 'session',
      url: '/apps/timer/',
      data: { minutes: 45, endedAt: Date.now() },
    }],
  });
  /* the session has no title, so it never becomes a WorkspaceObject — but
     its minutes still feed the week strip. The workspace is partial-data,
     not empty: the ledger must render and setup stays secondary. */
  expect(host.querySelector('.today-journal')).not.toBeNull();
  expect(host.querySelector('[aria-label="Minutes logged this week"]')).not.toBeNull();
  expect(host.querySelector('.it-hero')).toBeNull();
  expect(host.querySelector('.today-flow')).toBeNull();
  expect(buttonWith('Set up courses')).toBeDefined();
});

it('lays the day view out as a journal grid with next-up work leading', () => {
  render({ entities: [course(), block('b1', Date.now() + 60_000, { plannedMinutes: 25 })] });

  const grid = host.querySelector<HTMLElement>('.today-day-grid');
  expect(grid).not.toBeNull();
  const main = grid!.querySelector<HTMLElement>('.today-day-main');
  const aside = grid!.querySelector<HTMLElement>('.today-day-aside');
  expect(main).not.toBeNull();
  expect(aside).not.toBeNull();
  const labels = [...main!.querySelectorAll(':scope > section')].map((s) => s.getAttribute('aria-label'));
  expect(labels[0]).toBe('Next up scheduled work');
  expect(labels).toContain('Review and follow-up');
  expect(aside!.getAttribute('aria-label')).toBe('Resume and context');
  expect(host.querySelector('[aria-label="Next up scheduled work"]')).not.toBeNull();
});

it('keeps the session planner reachable from Plans and tools in the directory', () => {
  const { onEnter } = render({ entities: [course()] });
  clickTab('plans');
  expect(host.querySelector('#study-plan-title')).not.toBeNull();
  expect(host.querySelector('[aria-label="Planning desk"]')).not.toBeNull();

  clickTab('tools');
  const timerCard = [...host.querySelectorAll<HTMLButtonElement>('.today-tool-card')]
    .find((card) => card.textContent?.includes('Timer'));
  expect(timerCard).toBeDefined();
  act(() => timerCard!.click());
  expect(onEnter).toHaveBeenCalledWith('timer');
});

it('filters journal work by the active course lens', () => {
  render({
    activeCourseFilter: 'BIO 101',
    entities: [
      course(),
      {
        id: 'bio-note', key: 'ink:note:bio-note', app: 'ink', type: 'note',
        title: 'Biology notes', course: 'BIO 101', url: '/apps/ink/?note=bio-note',
        data: {}, updatedAt: Date.now(),
      },
      {
        id: 'chem-note', key: 'ink:note:chem-note', app: 'ink', type: 'note',
        title: 'Chemistry notes', course: 'CHEM 101', url: '/apps/ink/?note=chem-note',
        data: {}, updatedAt: Date.now() - 1000,
      },
    ],
  });
  clickTab('journal');
  const recent = host.querySelector<HTMLElement>('[aria-label="Recent work"]');
  expect(recent?.textContent).toContain('Biology notes');
  expect(recent?.textContent).not.toContain('Chemistry notes');
});

function commitment(id: string, dueAt: string, data: StoreEntity['data'] = {}): StoreEntity {
  return {
    id,
    key: `syllabus:commitment:${id}`,
    app: 'syllabus',
    type: 'commitment',
    title: 'Quiz 3',
    course: 'BIO 101',
    courseId: 'syllabus:course:bio',
    url: `/apps/syllabus/?commitment=${id}`,
    data: { type: 'quiz', dueAt, status: 'open', estimatedMinutes: 60, ...data },
  };
}

function localISODate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

it('leads with a named resume action while a focus session is live', () => {
  render({
    shared: { focus: { by: 'timer', at: Date.now(), v: { paused: true, label: 'Biology reading', course: 'BIO 101' } } },
  });
  const banner = host.querySelector('[aria-label="Active focus session"]');
  expect(banner?.textContent).toContain('Resume BIO 101');
});

it('names the scheduled block and its planned time in the first action', () => {
  render({
    entities: [
      course(),
      block('b1', Date.now() + 3_600_000, { plannedMinutes: 20, plannedDate: localISODate(), plannedStart: '18:30' }),
    ],
  });
  const card = host.querySelector('[aria-label="Next up scheduled work"]');
  expect(buttonWith('Start BIO 101 · 20 min', card!)).toBeDefined();
  expect(card?.textContent).toContain('Booked today · 18:30');
});

it('shows a newly filed assignment on Today and offers Find time today', () => {
  const { onGo } = render({
    entities: [course(), commitment('k1', new Date(Date.now() + 3 * 86_400_000).toISOString())],
  });
  const card = host.querySelector('[aria-label="Next up scheduled work"]');
  expect(card?.textContent).toContain('Quiz 3');
  expect(card?.textContent).toMatch(/due \w+ · no study block yet/);
  const find = buttonWith('Find time today', card!);
  expect(find).toBeDefined();
  act(() => find!.click());
  expect(onGo).toHaveBeenCalledWith('#/p/syllabus?p=today');
});

it('offers Find time today in Next up when due work has no study block', () => {
  const { onGo } = render({
    entities: [{
      id: 'prob1', key: 'proof:problem:prob1', app: 'proof', type: 'problem',
      title: 'Related rates', url: '/apps/proof/',
      data: { dueAt: Date.now() - 1000 }, updatedAt: Date.now(),
    }],
  });
  const card = host.querySelector('[aria-label="Next up scheduled work"]');
  expect(card?.textContent).toContain('no study block yet');
  const find = buttonWith('Find time today', card!);
  expect(find).toBeDefined();
  act(() => find!.click());
  expect(onGo).toHaveBeenCalledWith('#/p/syllabus?p=today');
});
