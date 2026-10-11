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
  it('terrain on empty/root', () => {
    expect(parseHash('')).toEqual({ place: '', course: '' });
    expect(parseHash('#/')).toEqual({ place: '', course: '' });
  });
  it('place route', () => {
    expect(parseHash('#/p/ink')).toEqual({ place: 'ink', course: '' });
  });
  it('unknown place falls back to terrain', () => {
    expect(parseHash('#/p/nope')).toEqual({ place: '', course: '' });
  });
  it('course route decodes the key', () => {
    expect(parseHash('#/c/MTH')).toEqual({ place: '', course: 'MTH' });
    expect(parseHash('#/c/Early%20Modern')).toEqual({ place: '', course: 'Early Modern' });
  });
  it('course wins over trailing place text', () => {
    expect(parseHash('#/c/MTH')).not.toEqual({ place: 'c', course: '' });
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
