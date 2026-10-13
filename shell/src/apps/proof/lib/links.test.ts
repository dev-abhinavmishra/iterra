import { describe, it, expect, afterEach } from 'vitest';
import {
  flashcardsCardsLink,
  timerDeepLink,
  parseInbound,
} from './links';
import type { AppSettings, Course, PracticeSession } from './types';

/* Deep-link contracts — the strings other apps parse. These pin the real
   bugs this layer has shipped: baseUrl crash on persisted settings that
   predate the field, and the ?course= carriage that files imported decks
   + session launches under the right dossier. */

const settings = (patch: Partial<AppSettings> = {}): AppSettings => ({
  timerBaseUrl: '/apps/timer',
  inkBaseUrl: '/apps/ink',
  modularBaseUrl: '/apps/modular',
  flashcardsBaseUrl: '/apps/flashcards',
  syllabusBaseUrl: '/apps/syllabus',
  gradestackBaseUrl: '/apps/gradestack',
  motion: 'full',
  defaultSessionMinutes: 30,
  ...patch,
});

const session = (patch: Partial<PracticeSession> = {}): PracticeSession => ({
  id: 's_1',
  rules: {
    courseIds: [],
    topics: [],
    minDifficulty: 1,
    maxDifficulty: 5,
    minutes: 25,
    newRatio: 0.5,
    order: 'interleaved',
  },
  problemIds: ['p1'],
  startedAt: '2026-01-01T00:00:00Z',
  ...patch,
});

const course = (patch: Partial<Course> = {}): Course => ({
  id: 'c_mth',
  code: 'MTH',
  name: 'Math',
  color: 'navy',
  createdAt: '2026-01-01T00:00:00Z',
  archived: false,
  ...patch,
});

const paramsOf = (url: string) => new URLSearchParams(url.split('?')[1]);

afterEach(() => {
  // tests that stub window must not leak it into the node env
  delete (globalThis as any).window;
});

describe('flashcardsCardsLink', () => {
  it('encodes cards as q:a|ex pairs under the canonical base', () => {
    const url = flashcardsCardsLink(
      settings(),
      [
        { q: 'cue?', a: 'watch for parts', ex: 'u=x' },
        { q: 'next?', a: 'integrate' },
      ],
      'Parts misconceptions',
    );
    expect(url.startsWith('/apps/flashcards/?')).toBe(true);
    const p = paramsOf(url);
    expect(p.get('title')).toBe('Parts misconceptions');
    expect(p.get('cards')).toBe('cue?:watch for parts|u=x;next?:integrate');
    expect(p.get('course')).toBeNull();
  });

  it('carries &course= when the problem has a course code', () => {
    const url = flashcardsCardsLink(settings(), [{ q: 'q', a: 'a' }], 't', 'MTH');
    expect(paramsOf(url).get('course')).toBe('MTH');
  });

  it('falls back to the canonical base when flashcardsBaseUrl is missing', () => {
    // persisted blob predates the field — previously threw undefined.replace
    const url = flashcardsCardsLink(
      { ...settings(), flashcardsBaseUrl: undefined as unknown as string },
      [{ q: 'q', a: 'a' }],
      't',
    );
    expect(url.startsWith('/apps/flashcards/?')).toBe(true);
  });

  it('strips a trailing slash on a custom base', () => {
    const url = flashcardsCardsLink(
      settings({ flashcardsBaseUrl: 'https://cards.example.com/' }),
      [{ q: 'q', a: 'a' }],
      't',
    );
    expect(url.startsWith('https://cards.example.com/?')).toBe(true);
  });
});

describe('timerDeepLink', () => {
  it('emits the timer inbound contract', () => {
    const url = timerDeepLink({ settings: settings(), session: session(), minutes: 25, label: 'drill MTH' });
    expect(url.startsWith('/apps/timer/?')).toBe(true);
    const p = paramsOf(url);
    expect(p.get('intent')).toBe('drill MTH');
    expect(p.get('minutes')).toBe('25');
    expect(p.get('from')).toBe('proof');
    expect(p.get('block')).toBe('s_1');
    expect(p.get('course')).toBeNull();
  });

  it('carries the course code when a course is bound', () => {
    const url = timerDeepLink({
      settings: settings(),
      session: session(),
      minutes: 50,
      label: 'focus',
      course: course(),
    });
    expect(paramsOf(url).get('course')).toBe('MTH');
  });

  it('falls back to the canonical base when timerBaseUrl is missing', () => {
    const url = timerDeepLink({
      settings: { ...settings(), timerBaseUrl: undefined as unknown as string },
      session: session(),
      minutes: 25,
      label: 'x',
    });
    expect(url.startsWith('/apps/timer/?')).toBe(true);
  });

  it('omits return outside a browser context, uses selfBase framed', () => {
    const solo = timerDeepLink({ settings: settings(), session: session(), minutes: 25, label: 'x' });
    expect(paramsOf(solo).get('return')).toBeNull();

    (globalThis as any).window = {
      iterra: { selfBase: () => 'http://shell.example' },
      location: { origin: 'http://fallback.example' },
    };
    const framed = timerDeepLink({ settings: settings(), session: session(), minutes: 25, label: 'x' });
    expect(paramsOf(framed).get('return')).toBe('http://shell.example');

    (globalThis as any).window = { location: { origin: 'http://fallback.example' } };
    const noHub = timerDeepLink({ settings: settings(), session: session(), minutes: 25, label: 'x' });
    expect(paramsOf(noHub).get('return')).toBe('http://fallback.example');
  });
});

describe('parseInbound', () => {
  it('completedBlock → timer-return with actual minutes', () => {
    expect(parseInbound('?completedBlock=b_42&actual=31')).toEqual({
      kind: 'timer-return',
      sessionId: 'b_42',
      actualMinutes: 31,
    });
  });

  it('completedBlock wins over other params', () => {
    expect(parseInbound('?completedBlock=b_1&problem=p_9&from=syllabus')?.kind).toBe('timer-return');
  });

  it('?problem=<id> → problem deep link', () => {
    expect(parseInbound('?problem=p_9')).toEqual({ kind: 'problem', problemId: 'p_9' });
  });

  it('syllabus prefill carries topic/minutes/course/intent', () => {
    expect(parseInbound('?from=syllabus&topic=parts&minutes=20&course=MTH&intent=drill')).toEqual({
      kind: 'syllabus-session',
      topic: 'parts',
      minutes: 20,
      course: 'MTH',
      intent: 'drill',
    });
  });

  it('non-numeric minutes degrade to undefined, not NaN', () => {
    const r = parseInbound('?minutes=abc');
    expect(r?.kind).toBe('syllabus-session');
    expect(r && 'minutes' in r && r.minutes).toBeUndefined();
  });

  it('empty and unrelated params → null', () => {
    expect(parseInbound('')).toBeNull();
    expect(parseInbound('?foo=bar')).toBeNull();
  });
});
