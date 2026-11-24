// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { execCommand } from '../../../integration/commands';
import { getPendingSessionOutcomes } from '../lib/session-outbox';
import { getSessions } from '../lib/stats';
import TimerView from './TimerView';

vi.mock('../../../integration/commands', () => ({ execCommand: vi.fn() }));

function blockPendingOutboxWrites() {
  const backing = globalThis.localStorage;
  const storage = {
    get length() { return backing.length; },
    clear: () => backing.clear(),
    key: (index: number) => backing.key(index),
    getItem: (key: string) => backing.getItem(key),
    removeItem: (key: string) => backing.removeItem(key),
    setItem: (key: string, value: string) => {
      if (key.startsWith('timer.session-outcome.pending.v1:')) throw new Error('quota');
      backing.setItem(key, value);
    },
  } as Storage;
  vi.stubGlobal('localStorage', storage);
  return () => vi.stubGlobal('localStorage', backing);
}

it.each(['', '&course=Forest%20Ecology', 'unbound'])('records a five-minute focus session after a missed final tick (%s)', async (course) => {
  vi.mocked(execCommand).mockClear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const now = vi.spyOn(Date, 'now').mockReturnValue(60_000);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    const unbound = course === 'unbound';
    const binding = unbound ? {} : { blockId: 'b1', commitmentId: 'c1' };
    await act(async () => {
      root.render(
        <TimerView
          active={false}
          presetMinutes={5}
          linkQuery={unbound ? '' : `from=syllabus&intent=Read&minutes=5&autostart=1&block=b1&commitment=c1${course}`}
        />,
      );
    });
    if (unbound) {
      await act(async () => host.querySelector<HTMLButtonElement>('[title="Start / Pause (Space)"]')?.click());
    }
    expect(getSessions()).toHaveLength(0);

    // Simulate a background tab whose next interval callback fires after expiry.
    now.mockReturnValue(361_000);
    await act(async () => {
      vi.advanceTimersByTime(50);
    });

    expect(getSessions()).toEqual([expect.objectContaining({
      duration: 300,
      type: 'focus',
      outcome: 'completed',
      ...binding,
    })]);
    expect(execCommand).toHaveBeenCalledOnce();
    expect(execCommand).toHaveBeenCalledWith('recordSessionOutcome', expect.objectContaining({
      outcome: 'completed',
      elapsedSeconds: 300,
      plannedMinutes: 5,
      ...binding,
    }));
  } finally {
    act(() => root.unmount());
    host.remove();
    localStorage.clear();
    now.mockRestore();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

it('submits an existing session row when a restored tab must finish the shared session', async () => {
  vi.mocked(execCommand).mockClear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const now = vi.spyOn(Date, 'now').mockReturnValue(60_000);
  // Simulate the other tab crashing after saveSession persisted this row but
  // before it enqueued or submitted recordSessionOutcome.
  localStorage.setItem('timer.sessions.v1', JSON.stringify([{
    id: 'shared-session', duration: 300, type: 'focus', timestamp: 360_000,
    label: 'Read', outcome: 'completed', blockId: 'b1', plannedMinutes: 5,
  }]));
  localStorage.setItem('timer.session.live.v1', JSON.stringify({
    running: true, endsAt: 360_000, totalMin: 5, label: 'Read',
    intent: 'Read', sessionId: 'shared-session',
    syllabus: { block: 'b1', from: 'syllabus' },
  }));
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => root.render(<TimerView active={false} />));
    now.mockReturnValue(361_000);
    await act(async () => vi.advanceTimersByTime(50));

    expect(getSessions()).toHaveLength(1);
    expect(execCommand).toHaveBeenCalledOnce();
    expect(execCommand).toHaveBeenCalledWith('recordSessionOutcome', expect.objectContaining({
      sessionId: 'shared-session', outcome: 'completed', blockId: 'b1',
      idempotencyKey: 'timer:shared-session',
    }));
  } finally {
    act(() => root.unmount());
    host.remove();
    localStorage.clear();
    now.mockRestore();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

it('waits for the outcome write, retries the same session, then opens Planning without filing again', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const open = vi.fn();
  vi.stubGlobal('iterra', { open, isFramed: () => true });
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const now = vi.spyOn(Date, 'now').mockReturnValue(60_000);
  const command = vi.mocked(execCommand);
  command.mockReset();
  let resolveFirst!: (result: Awaited<ReturnType<typeof execCommand>>) => void;
  command.mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }));
  command.mockResolvedValueOnce({ ok: true, commandId: 'saved', url: '/apps/syllabus/?block=b1' });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const button = (text: string) =>
    [...document.body.querySelectorAll('button')].find((element) => element.textContent?.trim() === text);

  try {
    await act(async () => {
      root.render(<TimerView active={false} linkQuery="from=syllabus&intent=Read&minutes=5&autostart=1&block=b1" />);
    });
    now.mockReturnValue(361_000);
    await act(async () => vi.advanceTimersByTime(50));
    expect(document.body.querySelector('[role=status]')?.textContent).toContain('Saving your focus session');
    expect(button('Open in Planning')).toBeUndefined();
    expect(button('Continue')).toBeUndefined();

    await act(async () => resolveFirst({ ok: false, commandId: 'failed', error: 'Failed' }));
    expect(document.body.querySelector('[role=alert]')?.textContent).toContain('Retry saving');
    expect(button('Open in Planning')).toBeUndefined();
    await act(async () => button('Retry save')?.click());
    expect(command).toHaveBeenCalledTimes(2);
    expect(command.mock.calls[1]).toEqual(command.mock.calls[0]);
    expect(getSessions()).toHaveLength(1);

    await act(async () => button('Open in Planning')?.click());
    expect(open).toHaveBeenCalledExactlyOnceWith('/apps/syllabus/?block=b1');
  } finally {
    act(() => root.unmount());
    host.remove();
    localStorage.clear();
    now.mockRestore();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

it('replays a failed outcome with the same idempotency key after Timer remounts', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('iterra', { open: vi.fn(), isFramed: () => true });
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const now = vi.spyOn(Date, 'now').mockReturnValue(60_000);
  const command = vi.mocked(execCommand);
  command.mockReset();
  command
    .mockResolvedValueOnce({ ok: false, commandId: 'offline', error: 'Offline' })
    .mockResolvedValueOnce({ ok: true, commandId: 'recovered', url: '/apps/syllabus/?block=b1' });
  const host = document.createElement('div');
  document.body.append(host);
  let root = createRoot(host);

  try {
    await act(async () => {
      root.render(<TimerView active={false} linkQuery="from=syllabus&intent=Read&minutes=5&autostart=1&block=b1" />);
    });
    now.mockReturnValue(361_000);
    await act(async () => vi.advanceTimersByTime(50));
    expect(command).toHaveBeenCalledOnce();
    expect(getPendingSessionOutcomes()).toHaveLength(1);
    const savedInput = command.mock.calls[0][1];

    act(() => root.unmount());
    root = createRoot(host);
    await act(async () => {
      root.render(<TimerView active={false} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(command).toHaveBeenCalledTimes(2);
    expect(command.mock.calls[1]).toEqual(['recordSessionOutcome', savedInput]);
    expect(getPendingSessionOutcomes()).toHaveLength(0);
  } finally {
    act(() => root.unmount());
    host.remove();
    localStorage.clear();
    now.mockRestore();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

it('keeps a failed completion retryable and visible when the outbox cannot be written', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('iterra', { open: vi.fn(), isFramed: () => true });
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const now = vi.spyOn(Date, 'now').mockReturnValue(60_000);
  const command = vi.mocked(execCommand);
  command.mockReset();
  command
    .mockResolvedValueOnce({ ok: false, commandId: 'offline', error: 'Offline' })
    .mockResolvedValueOnce({ ok: true, commandId: 'recovered', url: '/apps/syllabus/?block=b1' });
  const restoreStorage = blockPendingOutboxWrites();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(<TimerView active linkQuery="from=syllabus&intent=Read&minutes=5&autostart=1&block=b1" />);
    });
    now.mockReturnValue(361_000);
    await act(async () => vi.advanceTimersByTime(50));
    expect(document.body.querySelector('[role=alert]')?.textContent).toContain('retry copy couldn’t be saved');
    expect(getPendingSessionOutcomes()).toHaveLength(0);

    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true })));
    expect(document.body.querySelector('[role=alert]')).toBeDefined();
    expect(command).toHaveBeenCalledOnce();

    const retry = [...document.body.querySelectorAll('button')]
      .find((element) => element.textContent?.trim() === 'Retry save');
    await act(async () => retry?.click());
    expect(command).toHaveBeenCalledTimes(2);
    expect(document.body.querySelector('[role=alert]')).toBeNull();
  } finally {
    act(() => root.unmount());
    host.remove();
    localStorage.clear();
    restoreStorage();
    now.mockRestore();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

it('holds an early finish on screen until its outcome saves, then retries the same partial entry', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('iterra', { open: vi.fn(), isFramed: () => true });
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const now = vi.spyOn(Date, 'now').mockReturnValue(60_000);
  const command = vi.mocked(execCommand);
  command.mockReset();
  command
    .mockResolvedValueOnce({ ok: false, commandId: 'offline', error: 'Offline' })
    .mockResolvedValueOnce({ ok: true, commandId: 'recovered', url: '/apps/syllabus/?block=b1' });
  const restoreStorage = blockPendingOutboxWrites();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(<TimerView active linkQuery="from=syllabus&intent=Read&minutes=5&autostart=1&block=b1" />);
    });
    now.mockReturnValue(120_000);
    await act(async () => vi.advanceTimersByTime(50));
    await act(async () => window.dispatchEvent(new CustomEvent('timer:control', { detail: { op: 'finish' } })));

    expect(getSessions()).toEqual([expect.objectContaining({ outcome: 'partial', duration: 60 })]);
    expect(getPendingSessionOutcomes()).toHaveLength(0);
    expect(document.body.querySelector('[role=alert]')?.textContent).toContain('partial session');
    expect(document.body.querySelector('[role=alert]')?.textContent).toContain('retry copy couldn’t be saved');
    expect(command).toHaveBeenCalledOnce();

    const retry = [...document.body.querySelectorAll('button')]
      .find((element) => element.textContent?.trim() === 'Retry save');
    await act(async () => retry?.click());
    expect(command).toHaveBeenCalledTimes(2);
    expect(command.mock.calls[1]).toEqual(command.mock.calls[0]);
    expect(getPendingSessionOutcomes()).toHaveLength(0);
    expect(getSessions()).toHaveLength(1);
  } finally {
    act(() => root.unmount());
    host.remove();
    localStorage.clear();
    restoreStorage();
    now.mockRestore();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

it('treats a conflicting recorded outcome as terminal and dismisses only its own pending row', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('iterra', { open: vi.fn(), isFramed: () => true });
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const now = vi.spyOn(Date, 'now').mockReturnValue(60_000);
  const command = vi.mocked(execCommand);
  command.mockReset().mockResolvedValueOnce({
    ok: false,
    commandId: 'conflict',
    code: 'OUTCOME_CONFLICT',
    error: 'A different outcome was already recorded.',
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(<TimerView active={false} linkQuery="from=syllabus&intent=Read&minutes=5&autostart=1&block=b1" />);
    });
    now.mockReturnValue(361_000);
    await act(async () => vi.advanceTimersByTime(50));

    expect(document.body.querySelector('[role=alert]')?.textContent).toContain('different outcome on record');
    expect(getPendingSessionOutcomes()).toHaveLength(0);
    const buttons = [...document.body.querySelectorAll('button')].map((button) => button.textContent?.trim());
    expect(buttons).toContain('Dismiss');
    expect(buttons).not.toContain('Retry save');

    await act(async () => [...document.body.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Dismiss')?.click());
    expect(getPendingSessionOutcomes()).toHaveLength(0);
  } finally {
    act(() => root.unmount());
    host.remove();
    localStorage.clear();
    now.mockRestore();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
