import { describe, it, expect, beforeEach } from 'vitest';
import { readShared, readIndexes, readFeed } from './hub';

/* Mesh contract tests — the shapes apps write into iterra.v1.doc.* must
   read back as the structures shell components consume (docs/WIRING.md §7). */

const store: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = String(v); },
  removeItem: (k: string) => { delete store[k]; },
  key: (i: number) => Object.keys(store)[i] ?? null,
  get length() { return Object.keys(store).length; },
};
(globalThis as any).window = { addEventListener: () => {}, removeEventListener: () => {}, setInterval: () => 0, clearInterval: () => {} };
(globalThis as any).StorageEvent = class { constructor(public type: string, public init?: any) {} };

beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; });

describe('shared commons doc', () => {
  it('reads stamped {v,by,at} fields', () => {
    store['iterra.v1.doc.shared'] = JSON.stringify({
      focus: { v: { running: true, label: 'ps4 drill', blockId: 'b1', course: 'MTH', endsInMin: 25 }, by: 'timer', at: 1 },
      activeCourse: { v: { code: 'MTH', name: 'Math' }, by: 'syllabus', at: 2 },
    });
    const m = readShared();
    expect(m.focus.by).toBe('timer');
    expect((m.focus.v as any).course).toBe('MTH');
    expect((m.activeCourse.v as any).code).toBe('MTH');
  });
  it('malformed or missing docs read as {}', () => {
    store['iterra.v1.doc.shared'] = '{broken';
    expect(readShared()).toEqual({});
    store['iterra.v1.doc.shared'] = JSON.stringify([1, 2, 3]);
    expect(readShared()).toEqual({});
  });
});

describe('entity indexes', () => {
  it('reads entities per app under index.<app> keys', () => {
    store['iterra.v1.doc.index.syllabus'] = JSON.stringify({
      entities: [{ t: 'block', id: 'b2', title: 'read ch. 7', course: 'MTH', url: '/apps/syllabus/?block=b2', at: 5 }],
    });
    store['iterra.v1.doc.index.flashcards'] = JSON.stringify({
      entities: [{ t: 'deck', id: 'd1', title: 'MTH derivatives', course: 'MTH', url: '/apps/flashcards/?deck=d1' }],
    });
    store['iterra.v1.doc.feed'] = '{"items":[]}' /* ignored — not an index key */;
    const m = readIndexes();
    expect(Object.keys(m).sort()).toEqual(['flashcards', 'syllabus']);
    expect(m.syllabus[0].id).toBe('b2');
    expect(m.syllabus[0].url).toBe('/apps/syllabus/?block=b2');
    expect(m.flashcards[0].course).toBe('MTH');
  });
  it('a doc without an entities array reads as []', () => {
    store['iterra.v1.doc.index.ink'] = JSON.stringify({ nope: 1 });
    expect(readIndexes().ink).toEqual([]);
  });
});

describe('stirrings feed', () => {
  it('reads newest-first items', () => {
    store['iterra.v1.doc.feed'] = JSON.stringify({
      items: [{ app: 'syllabus', text: 'slip stamped: ps4', url: '/apps/syllabus/?block=b1', at: 9 }],
    });
    expect(readFeed()[0]).toMatchObject({ app: 'syllabus', at: 9 });
  });
  it('missing/broken feed reads as []', () => {
    expect(readFeed()).toEqual([]);
    store['iterra.v1.doc.feed'] = 'zzz';
    expect(readFeed()).toEqual([]);
  });
  it('stirs may carry course/topic linkage keys (dossiers file on them)', () => {
    store['iterra.v1.doc.feed'] = JSON.stringify({
      items: [{ app: 'syllabus', text: 'filed 25m', course: 'MTH', at: 9 }],
    });
    const f = readFeed()[0];
    expect(f.course).toBe('MTH');
    expect(f.topic).toBeUndefined();
  });
});
