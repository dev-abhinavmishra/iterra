import { describe, it, expect } from 'vitest';
import { parseHash, appUrl } from './route';
import { readShelf, togglePin, isPinned } from './shelf';

// localStorage stub for the shelf tests
const store: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = String(v); },
  removeItem: (k: string) => { delete store[k]; },
};
(globalThis as any).window = { dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} };
(globalThis as any).StorageEvent = class { constructor(public type: string, public init?: any) {} };

describe('parseHash', () => {
  // query/section are non-enumerable on the parsed route — assert fields directly
  it('landing on bare url and welcome route', () => {
    for (const r of [parseHash(''), parseHash('#'), parseHash('#/welcome')]) {
      expect(r.place).toBe('');
      expect(r.course).toBe('');
      expect(r.query).toBe('');
      expect(r.section).toBe('welcome');
    }
  });
  it('today workspace route — "#/" stays the in-app home', () => {
    for (const r of [parseHash('#/'), parseHash('#/today'), parseHash('#/today?x=1')]) {
      expect(r.place).toBe('');
      expect(r.section).toBe('today');
    }
  });
  it('today sample-preview query survives the parse', () => {
    const r = parseHash('#/today?sample=1');
    expect(r.place).toBe('');
    expect(r.section).toBe('today');
    expect(r.query).toBe('sample=1');
    /* the bare Today route carries no query — the preview is opt-in only */
    expect(parseHash('#/today').query).toBe('');
  });
  it('place route', () => {
    const r = parseHash('#/p/ink');
    expect(r.place).toBe('ink');
    expect(r.course).toBe('');
    expect(r.query).toBe('');
    expect(r.section).toBe('place');
  });
  it('place names resolve case-insensitively', () => {
    expect(parseHash('#/p/Ink').place).toBe('ink');
    const r = parseHash('#/p/RHYTHM?p=today');
    expect(r.place).toBe('rhythm');
    expect(r.query).toBe('p=today');
    expect(r.section).toBe('place');
  });
  it('unknown place falls back to terrain', () => {
    const r = parseHash('#/p/nope');
    expect(r.place).toBe('');
    expect(r.course).toBe('');
    expect(r.section).toBe('today');
  });
  it('course route decodes the key', () => {
    const a = parseHash('#/c/MTH');
    expect(a.place).toBe('');
    expect(a.course).toBe('MTH');
    expect(a.section).toBe('courses');
    const b = parseHash('#/c/Early%20Modern');
    expect(b.course).toBe('Early Modern');
  });
  it('courses directory and library routes', () => {
    expect(parseHash('#/courses').section).toBe('courses');
    expect(parseHash('#/courses').course).toBe('');
    expect(parseHash('#/library').section).toBe('library');
    expect(parseHash('#/p/timer?minutes=25&from=syllabus').query).toBe('minutes=25&from=syllabus');
  });
  it('course wins over trailing place text', () => {
    expect(parseHash('#/c/MTH')).not.toEqual({ place: 'c', course: '', query: '' });
  });
});

describe('appUrl', () => {
  it('joins place + path', () => {
    expect(appUrl('timer')).toBe('/apps/timer/');
    expect(appUrl('ink', '/?note=n1')).toBe('/apps/ink/?note=n1');
  });
});

describe('shelf', () => {
  it('pin → isPinned → unpin', () => {
    const pin = { app: 'ink', title: 'n1', url: '/apps/ink/?note=n1' };
    togglePin(pin);
    expect(isPinned(pin.url)).toBe(true);
    expect(readShelf()[0].title).toBe('n1');
    togglePin(pin); // toggles off by url
    expect(isPinned(pin.url)).toBe(false);
    expect(readShelf()).toHaveLength(0);
  });
});
