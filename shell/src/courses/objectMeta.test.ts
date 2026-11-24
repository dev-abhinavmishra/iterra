import { describe, it, expect } from 'vitest';
import { objectMetaLine } from './objectMeta';

/* Metadata-line contract: "course · item type · source" with graceful
   omission — three same-titled objects stay distinguishable, and missing
   fields never render as "undefined". */

describe('objectMetaLine', () => {
  it('orders course, item type, then source app', () => {
    expect(
      objectMetaLine({ course: 'BIO 101', type: 'note', app: 'ink', detail: '12 cards' }),
    ).toBe('BIO 101 · Note · Notes · 12 cards');
  });

  it('uses the place label for known apps and the raw id otherwise', () => {
    expect(objectMetaLine({ type: 'deck', app: 'flashcards' })).toBe('Deck · Flashcards');
    expect(objectMetaLine({ type: 'deck', app: 'mystery' })).toBe('Deck · mystery');
  });

  it('omits missing fields instead of printing undefined', () => {
    expect(objectMetaLine({ type: 'quiz' })).toBe('Quiz');
    expect(objectMetaLine({ course: 'CHEM', app: 'margin' })).toBe('CHEM · Study Materials');
    expect(objectMetaLine({})).toBe('');
    expect(objectMetaLine({ course: '  ', type: null, app: undefined })).toBe('');
  });

  it('keeps topic as the trailing qualifier', () => {
    expect(
      objectMetaLine({ course: 'BIO', type: 'deck', app: 'flashcards', topic: 'Cell division' }),
    ).toBe('BIO · Deck · Flashcards · Cell division');
  });
});
