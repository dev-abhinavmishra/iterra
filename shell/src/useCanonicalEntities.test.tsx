// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useCanonicalEntities } from './useCanonicalEntities';
import { WorkspaceDataGate } from './WorkspaceDataGate';

const mocks = vi.hoisted(() => ({ subscribe: vi.fn(), reconcile: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./hub', () => ({ subscribeStore: mocks.subscribe }));
vi.mock('./integration/identity', () => ({ reconcileFollowUps: mocks.reconcile }));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let list: ReturnType<typeof vi.fn>;
let unsubscribe: ReturnType<typeof vi.fn>;
let retry: ReturnType<typeof vi.fn>;

function View() {
  const { entities, initialState, retry: retryRead } = useCanonicalEntities();
  return <WorkspaceDataGate state={initialState} onRetry={retryRead}>
    <p>{entities.length ? `Loaded ${entities.length} course` : 'Set up courses'}</p>
  </WorkspaceDataGate>;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  list = vi.fn(); unsubscribe = vi.fn(); retry = vi.fn();
  mocks.subscribe.mockReset().mockReturnValue(unsubscribe);
  vi.stubGlobal('iterra', { store: { list } });
});
afterEach(() => {
  act(() => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals();
});

it('shows loading until a real empty result resolves, then offers setup', async () => {
  let resolve!: (value: unknown[]) => void;
  list.mockReturnValue(new Promise(r => { resolve = r; }));
  act(() => root.render(<View />));
  expect(host.textContent).toContain('Loading your workspace');
  expect(host.textContent).not.toContain('Set up courses');
  await act(async () => resolve([]));
  expect(host.textContent).toContain('Set up courses');
});

it('does not show empty actions while a populated result is pending', async () => {
  let resolve!: (value: unknown[]) => void;
  list.mockReturnValue(new Promise(r => { resolve = r; }));
  act(() => root.render(<View />));
  expect(host.textContent).not.toContain('Set up courses');
  await act(async () => resolve([{ id: 'course' }]));
  expect(host.textContent).toContain('Loaded 1 course');
});

it('retries a rejected initial read in place and shows the recovered data', async () => {
  list.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce([{ id: 'course' }]);
  await act(async () => root.render(<View />));
  expect(host.querySelector('[role=alert]')?.textContent).toContain('could not be loaded');
  await act(async () => host.querySelector('button')?.click());
  expect(list).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain('Loaded 1 course');
});

it('offers retry on a stalled read and recovers when it later resolves', async () => {
  let resolve!: (value: unknown[]) => void;
  list.mockReturnValue(new Promise(r => { resolve = r; }));
  act(() => root.render(<View />));
  await act(async () => vi.advanceTimersByTimeAsync(8000));
  expect(host.querySelector('[role=alert]')).not.toBeNull();
  await act(async () => resolve([{ id: 'course' }]));
  expect(host.textContent).toContain('Loaded 1 course');
});

it('unsubscribes and ignores a read that resolves after unmount', async () => {
  let resolve!: (value: unknown[]) => void;
  list.mockReturnValue(new Promise(r => { resolve = r; }));
  act(() => root.render(<View />));
  act(() => root.unmount());
  expect(unsubscribe).toHaveBeenCalledOnce();
  await act(async () => { resolve([]); await vi.advanceTimersByTimeAsync(16000); });
  expect(list).toHaveBeenCalledOnce();
  root = createRoot(host);
});

it('retains the available library index with an explicit incomplete-data warning', () => {
  act(() => root.render(<WorkspaceDataGate state="error" allowFallback onRetry={retry}><p>Indexed material</p></WorkspaceDataGate>));
  expect(host.textContent).toContain('Indexed material');
  expect(host.querySelector('[role=alert]')?.textContent).toContain('Some saved items may be missing');
});
