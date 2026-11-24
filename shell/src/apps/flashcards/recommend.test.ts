import { describe, expect, it } from 'vitest';
import {
  dueCount,
  estimateMinutes,
  recommendSession,
  repeatMissed,
  REPEAT_MISS_THRESHOLD,
  SECS_PER_CARD,
  SESSION_TARGET_MIN,
} from './recommend';

const card = (id: string, status = 'new', misses = 0) => ({ id, status, misses });

describe('dueCount / estimateMinutes', () => {
  it('counts every non-mastered card as due', () => {
    expect(dueCount({ cards: [card('a'), card('b', 'learning'), card('c', 'mastered')] })).toBe(2);
    expect(dueCount(null)).toBe(0);
    expect(dueCount({ cards: [] })).toBe(0);
  });

  it('estimates ~20s per card, minimum 1 minute', () => {
    expect(estimateMinutes(12)).toBe(4);   // the ticket's example
    expect(estimateMinutes(1)).toBe(1);
    expect(estimateMinutes(0)).toBe(0);
    expect(estimateMinutes(3)).toBe(1);
  });
});

describe('recommendSession', () => {
  it('returns null when nothing is due', () => {
    expect(recommendSession(null)).toBeNull();
    expect(recommendSession({ cards: [card('a', 'mastered')] })).toBeNull();
    expect(recommendSession({ cards: [] })).toBeNull();
  });

  it('labels a typical due set with count and minutes', () => {
    const d = { cards: Array.from({ length: 12 }, (_, i) => card(`c${i}`, 'learning')) };
    const rec = recommendSession(d)!;
    expect(rec.due).toBe(12);
    expect(rec.count).toBe(12);
    expect(rec.minutes).toBe(4);
    expect(rec.label).toBe('12 cards due · about 4 min');
  });

  it('uses singular copy for one card', () => {
    const rec = recommendSession({ cards: [card('a', 'new')] })!;
    expect(rec.label).toBe('1 card due · about 1 min');
  });

  it('caps large due sets to what fits the target window', () => {
    const maxCards = Math.floor((SESSION_TARGET_MIN * 60) / SECS_PER_CARD);
    const d = { cards: Array.from({ length: maxCards + 30 }, (_, i) => card(`c${i}`)) };
    const rec = recommendSession(d)!;
    expect(rec.due).toBe(maxCards + 30);
    expect(rec.count).toBe(maxCards);
    expect(rec.minutes).toBe(SESSION_TARGET_MIN);
    expect(rec.label).toBe(`first ${maxCards} of ${maxCards + 30} cards · about ${SESSION_TARGET_MIN} min`);
  });
});

describe('repeatMissed', () => {
  const deck = {
    cards: [
      card('flaky', 'learning', 3),   // missed in 3 sessions
      card('slip', 'learning', 1),    // first miss just now
      card('fixed', 'learning', 0),
      card('gone-miss', 'learning', 5),
    ],
  };

  it('keeps only session misses at the repeat threshold', () => {
    expect(repeatMissed(deck, ['flaky', 'slip', 'fixed'])).toEqual(['flaky']);
  });

  it('ignores ids not missed this session and cards deleted since', () => {
    expect(repeatMissed(deck, ['flaky', 'deleted-card'])).toEqual(['flaky']);
    expect(repeatMissed(deck, [])).toEqual([]);
  });

  it('honours a custom threshold', () => {
    expect(repeatMissed(deck, ['flaky', 'slip'], 1)).toEqual(['flaky', 'slip']);
    expect(repeatMissed(deck, ['flaky'], REPEAT_MISS_THRESHOLD + 2)).toEqual([]);
  });

  it('tolerates missing decks', () => {
    expect(repeatMissed(null, ['x'])).toEqual([]);
    expect(repeatMissed(undefined, ['x'])).toEqual([]);
  });
});
