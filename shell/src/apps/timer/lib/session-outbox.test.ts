// @vitest-environment jsdom

import { afterEach, expect, it } from 'vitest';
import {
  clearPendingSessionOutcome,
  enqueueSessionOutcome,
  getPendingSessionOutcomes,
} from './session-outbox';

afterEach(() => localStorage.clear());

it('durably keeps a retryable outcome per session and clears only the committed session', () => {
  const first = {
    sessionId: 'session/one',
    outcome: 'completed' as const,
    elapsedSeconds: 1500,
    plannedMinutes: 25,
    blockId: 'b1',
    idempotencyKey: 'timer:session/one',
  };
  const second = {
    sessionId: 'session-two',
    outcome: 'partial' as const,
    elapsedSeconds: 420,
    plannedMinutes: 25,
    idempotencyKey: 'timer:session-two',
  };

  expect(enqueueSessionOutcome(first)).toBe(true);
  expect(enqueueSessionOutcome(second)).toBe(true);
  expect(getPendingSessionOutcomes()).toEqual([first, second]);

  clearPendingSessionOutcome(first.sessionId);
  expect(getPendingSessionOutcomes()).toEqual([second]);
});

it('does not clear a newer same-session payload from a racing tab', () => {
  const earlier = { sessionId: 'shared', outcome: 'partial' as const, elapsedSeconds: 300 };
  const newer = { sessionId: 'shared', outcome: 'completed' as const, elapsedSeconds: 1500 };
  enqueueSessionOutcome(newer);
  clearPendingSessionOutcome('shared', earlier);
  expect(getPendingSessionOutcomes()).toEqual([newer]);
});

it('preserves the first pending payload if another tab proposes a conflicting outcome', () => {
  const completed = { sessionId: 'shared', outcome: 'completed' as const, elapsedSeconds: 1500 };
  const partial = { sessionId: 'shared', outcome: 'partial' as const, elapsedSeconds: 420 };
  expect(enqueueSessionOutcome(completed)).toBe(true);
  expect(enqueueSessionOutcome(partial)).toBe(false);
  expect(getPendingSessionOutcomes()).toEqual([completed]);
});
