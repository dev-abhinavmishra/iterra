// Contract pin — margin's canonical-store adapter shapes.
// Pure helpers only: entity builders, first-line extraction, intake seeding.
// window is stubbed before import — iterra.ts wires its bridge at module load.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Deck, Note, Quiz } from './types';

type A = typeof import('./iterra-adapter');
let adapter: A;

/* cold dynamic import of the adapter graph pays real seconds on a loaded
   disk — the 10s hook default has timed out under load */
beforeAll(async () => {
  vi.stubGlobal('window', {});
  adapter = await import('./iterra-adapter');
}, 60000);

const note = (over: Partial<Note> = {}): Note => ({
  id: 'n1',
  title: 'Cell respiration',
  date: 'Oct 11, 2026',
  content: '# Glycolysis\n\nGlucose splits into pyruvate.',
  transcript: '',
  type: 'TEXT',
  tags: ['BIO'],
  lastAccessed: '2026-10-11T09:00:00Z',
  ...over,
});

describe('firstLine', () => {
  it('strips markdown + html and truncates', () => {
    expect(adapter.firstLine('# Title\n\nbody text')).toBe('Title body text');
    expect(adapter.firstLine('<p>Hello <b>world</b></p>')).toBe('Hello world');
    expect(adapter.firstLine('')).toBeUndefined();
    expect(adapter.firstLine(undefined)).toBeUndefined();
    expect(adapter.firstLine('x'.repeat(200))!.length).toBe(80);
  });
});

describe('entity builders', () => {
  it('note entity carries title/sub/course/data', () => {
    const e = adapter.noteEntity(note(), { course: 'BIO', courseId: 'syllabus:course:c1' });
    expect(e).toMatchObject({
      app: 'margin', type: 'note', id: 'n1', title: 'Cell respiration',
      sub: 'Glycolysis Glucose splits into pyruvate.',
      course: 'BIO', courseId: 'syllabus:course:c1',
      url: '/apps/margin/?note=n1',
    });
    const d = e.data as Record<string, unknown>;
    expect(d.updated).toBe('2026-10-11T09:00:00Z');
    expect(d.tags).toEqual(['BIO']);
  });

  it('untitled note falls back to a title', () => {
    const e = adapter.noteEntity(note({ title: '', content: '' }));
    expect(e.title).toBe('untitled');
    expect(e.sub).toBeUndefined();
  });

  it('deck + quiz entities carry counts', () => {
    const deck: Deck = { id: 'd1', title: 'Bio terms', createdAt: '2026-10-01', cards: [{ id: 'k', front: 'q', back: 'a', ease: 2.5, interval: 0, due: '', reps: 0, lapses: 0 }] };
    const de = adapter.deckEntity(deck);
    expect(de).toMatchObject({ app: 'margin', type: 'deck', id: 'd1', sub: '1 cards', url: '/apps/margin/?deck=d1' });
    const quiz: Quiz = { id: 'q1', title: 'Quiz 1', createdAt: '2026-10-02', questions: [{ question: 'q', options: [], answer: 'a' }], attempts: [{ at: 'x', score: 1, total: 1 }] };
    const qe = adapter.quizEntity(quiz);
    expect(qe).toMatchObject({ app: 'margin', type: 'quiz', id: 'q1', sub: '1 questions' });
    expect((qe.data as Record<string, unknown>).attempts).toBe(1);
  });
});

describe('note.create intake', () => {
  it('seeds a note from the sending entity + selection text', () => {
    const n = adapter.intakeNote({
      id: 'in-9', from: 'ink',
      entity: { app: 'ink', type: 'note', id: 'p1', title: 'Wet ink' },
      payload: { text: 'the selection' },
    });
    expect(n.id).toBe('intake-in-9');
    expect(n.title).toBe('Wet ink');
    expect(n.content).toContain('# Wet ink');
    expect(n.content).toContain('the selection');
    expect(n.tags).toEqual(['ink']);
    expect(n.type).toBe('TEXT');
  });
});
