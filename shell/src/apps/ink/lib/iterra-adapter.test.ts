// Contract pin — ink's canonical-store adapter shapes.
// Pure helpers only: entity builder, intake doc seeding, first-line extraction.
import { beforeAll, describe, expect, it } from 'vitest';
import { firstLine, intakeDoc, noteEntity } from './iterra-adapter';
import type { Note } from '../store';

const doc = (texts: string[]) =>
  JSON.stringify({ type: 'doc', content: texts.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })) });

const note = (over: Partial<Note> = {}): Note => ({
  id: 'p1',
  title: 'Field notes',
  content: doc(['Wet ink dries', 'second line']),
  tags: ['HST'],
  lastModified: 1760000000000,
  createdAt: 1760000000000,
  isPinned: false,
  folder: 'Unfiled',
  wordCount: 4,
  trashedAt: null,
  dailyKey: null,
  ...over,
});

describe('firstLine', () => {
  it('flattens tiptap json and truncates', () => {
    expect(firstLine(doc(['Hello world', 'rest']))).toBe('Hello world rest');
    expect(firstLine('')).toBeUndefined();
    expect(firstLine(undefined)).toBeUndefined();
    expect(firstLine(doc(['x'.repeat(200)]))!.length).toBeLessThanOrEqual(81);
  });
});

describe('course binding', () => {
  beforeAll(() => {
    /* addNote → zustand persist writes; stub storage so the store inits */
    const mem = new Map<string, string>();
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, String(v)),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
      get length() { return mem.size; },
      key: (i: number) => [...mem.keys()][i] ?? null,
    };
  });

  it('addNote keeps a caller-supplied course binding', async () => {
    const { useStore } = await import('../store');
    const id = useStore.getState().addNote({ courseId: 'syllabus:course:c1', course: 'BIO 201' });
    const n = useStore.getState().notes.find((x) => x.id === id);
    expect(n?.courseId).toBe('syllabus:course:c1');
    expect(n?.course).toBe('BIO 201');
  });
});

describe('note entity', () => {
  it('carries title/sub/course/data', () => {
    const e = noteEntity(note(), { course: 'HST', courseId: 'syllabus:course:c2' });
    expect(e).toMatchObject({
      app: 'ink', type: 'note', id: 'p1', title: 'Field notes',
      course: 'HST', courseId: 'syllabus:course:c2',
      url: '/apps/ink/?note=p1',
    });
    const d = e.data as Record<string, unknown>;
    expect(d.updated).toBe(1760000000000);
    expect(d.folder).toBe('Unfiled');
    expect(d.tags).toEqual(['HST']);
  });
});

describe('note.create intake', () => {
  it('seeds a doc with the entity title as heading + selection paragraph', () => {
    const raw = intakeDoc({
      from: 'margin',
      entity: { app: 'margin', type: 'note', id: 'n1', title: 'Cell respiration' },
      payload: { text: 'glycolysis splits glucose' },
    });
    const d = JSON.parse(raw);
    expect(d.content[0].type).toBe('heading');
    expect(d.content[0].content[0].text).toBe('Cell respiration');
    expect(d.content[1].content[0].text).toBe('glycolysis splits glucose');
  });

  it('no selection still leaves a writable page', () => {
    const d = JSON.parse(intakeDoc({ entity: { title: 'T' } }));
    expect(d.content[0].type).toBe('heading');
    expect(d.content.some((n: { type: string }) => n.type === 'paragraph')).toBe(true);
  });
});
