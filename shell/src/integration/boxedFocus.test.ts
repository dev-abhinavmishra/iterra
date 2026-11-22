import { expect, it } from 'vitest';
import { boxedFocusMinutes, boxedFocusUrl, parseBoxedFocus } from './boxedFocus';
import { parseSyllabusLink } from '../apps/timer/lib/deeplink';
import type { StoreEntity } from '../hub';

const target = { date: '2026-11-19', blockId: 'block_1' };

it('round-trips a valid board target through a Timer link and rejects malformed targets', () => {
  const link = new URLSearchParams({ from: 'boxed', return: boxedFocusUrl(target) });
  expect(parseSyllabusLink(link.toString())?.boxedFocus).toEqual(target);
  expect(parseBoxedFocus({ ...target, date: '2026-02-30' })).toBeUndefined();
  expect(parseBoxedFocus({ ...target, blockId: '"other' })).toBeUndefined();
  expect(parseSyllabusLink(new URLSearchParams({ from: 'ink', return: boxedFocusUrl(target) }).toString())?.boxedFocus)
    .toBeUndefined();
});

it('adds saved session time only to the matching day and box', () => {
  const session = (id: string, minutes: number, boxedFocus: unknown): StoreEntity => ({
    key: `timer:session:${id}`, app: 'timer', type: 'session', id, data: { minutes, boxedFocus },
  });
  expect([...boxedFocusMinutes([
    session('first', 1, target),
    session('second', 1, target),
    session('canceled', 0, target),
    session('another-day', 2, { ...target, date: '2026-11-20' }),
    session('missing', 2, undefined),
    session('another-block', 3, { ...target, blockId: 'block_2' }),
  ], target.date)]).toEqual([['block_1', 2], ['block_2', 3]]);
});
