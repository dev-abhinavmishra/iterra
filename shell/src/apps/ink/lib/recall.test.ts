// Contract pin — selection → recall card payload for createDeckFromSelection.
import { describe, expect, it } from 'vitest';
import type { Note } from '../store';
import {
  RECALL_DECK_TITLE,
  findRecallDeckId,
  recallBackDefault,
  recallCardPayload,
  recallFrontFromSelection,
  noteDeepLink,
} from './recall';

const note = (over: Partial<Note> = {}): Note => ({
  id: 'n1',
  title: 'Field notes',
  content: '{}',
  tags: ['BIO'],
  lastModified: 1,
  createdAt: 1,
  isPinned: false,
  folder: 'Unfiled',
  wordCount: 0,
  trashedAt: null,
  dailyKey: null,
  ...over,
});

const memStorage = (entries: Record<string, string> = {}) => {
  const map = new Map(Object.entries(entries));
  return { getItem: (k: string) => map.get(k) ?? null };
};

describe('recallFrontFromSelection', () => {
  it('collapses whitespace and unwraps wikilinks', () => {
    expect(recallFrontFromSelection('  Mitosis   splits\n\none cell  ')).toBe('Mitosis splits one cell');
    expect(recallFrontFromSelection('see [[Cell cycle]] here')).toBe('see Cell cycle here');
  });
});

describe('findRecallDeckId', () => {
  it('finds the shared recall deck by title', () => {
    const decks = {
      d1: { title: 'Bio exam' },
      d2: { title: RECALL_DECK_TITLE },
    };
    const storage = memStorage({ 'cardfile.decks.v1': JSON.stringify(decks) });
    expect(findRecallDeckId(storage)).toBe('d2');
  });

  it('returns null when absent or unreadable', () => {
    expect(findRecallDeckId(memStorage())).toBeNull();
    expect(findRecallDeckId(memStorage({ 'cardfile.decks.v1': 'not json' }))).toBeNull();
  });
});

describe('recallCardPayload', () => {
  it('builds a one-card createDeckFromSelection input with provenance', () => {
    const n = note({ courseId: 'syllabus:course:c1', course: 'BIO 201' });
    const payload = recallCardPayload(n, 'ATP stores energy', 'ATP stores energy', recallBackDefault(n), memStorage()) as {
      sourceRef: { app: string; type: string; id: string };
      deckTitle: string;
      cards: { q: string; a: string; ex: string }[];
      courseId?: string;
      excerpt: string;
      appendToDeckId?: string;
    };
    expect(payload.sourceRef).toMatchObject({ app: 'ink', type: 'note', id: 'n1' });
    expect(payload.deckTitle).toBe(RECALL_DECK_TITLE);
    expect(payload.cards).toHaveLength(1);
    expect(payload.cards[0].q).toBe('ATP stores energy');
    expect(payload.cards[0].a).toBe('From “Field notes”');
    // back/ex carries the source: title plus the deep link back to the note
    expect(payload.cards[0].ex).toContain('Field notes');
    expect(payload.cards[0].ex).toContain(noteDeepLink('n1'));
    expect(payload.courseId).toBe('syllabus:course:c1');
    expect(payload.excerpt).toBe('ATP stores energy');
    expect(payload.appendToDeckId).toBeUndefined();
  });

  it('appends to the existing recall deck when present', () => {
    const decks = { d9: { title: RECALL_DECK_TITLE } };
    const storage = memStorage({ 'cardfile.decks.v1': JSON.stringify(decks) });
    const payload = recallCardPayload(note(), 'sel', 'q', 'a', storage) as { appendToDeckId?: string };
    expect(payload.appendToDeckId).toBe('d9');
  });
});
