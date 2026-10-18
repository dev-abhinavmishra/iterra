import { describe, it, expect, beforeEach } from 'vitest';
import { readShelf, isPinned, togglePin, subscribeShelf } from './shelf';

/* Shelf contract tests — pins are shell-owned chrome; malformed entries
   drop at read, toggles dedupe by url, subscribers hear same-tab writes. */

const store: Record<string, string> = {};
const listeners: Record<string, ((ev: any) => void)[]> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = String(v); },
  removeItem: (k: string) => { delete store[k]; },
  key: (i: number) => Object.keys(store)[i] ?? null,
  get length() { return Object.keys(store).length; },
};
(globalThis as any).window = {
  addEventListener: (t: string, fn: any) => { (listeners[t] ??= []).push(fn); },
  removeEventListener: (t: string, fn: any) => { listeners[t] = (listeners[t] ?? []).filter((f) => f !== fn); },
  dispatchEvent: (ev: any) => { (listeners[ev.type] ?? []).forEach((f) => f(ev)); return true; },
};
(globalThis as any).StorageEvent = class { constructor(public type: string, public init?: any) { Object.assign(this, init); } };

const pin = (n: number | string) => ({ app: 'proof', title: `p${n}`, url: `/apps/proof/?problem=${n}` });

beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; });

describe('shelf pins', () => {
  it('toggle adds then removes by url', () => {
    togglePin(pin('a'));
    expect(isPinned('/apps/proof/?problem=a')).toBe(true);
    togglePin(pin('a'));
    expect(isPinned('/apps/proof/?problem=a')).toBe(false);
  });

  it('re-pinning a different object keeps both, newest first', () => {
    togglePin(pin('a'));
    togglePin(pin('b'));
    const s = readShelf();
    expect(s.map((p) => p.url)).toEqual(['/apps/proof/?problem=b', '/apps/proof/?problem=a']);
  });

  it('caps at 24 pins', () => {
    for (let i = 0; i < 30; i++) togglePin(pin(i));
    expect(readShelf()).toHaveLength(24);
    expect(readShelf()[0].url).toBe('/apps/proof/?problem=29');
  });

  it('malformed pins drop at read', () => {
    store['iterra.v1.shelf'] = JSON.stringify({ pins: [pin('ok'), { app: 'x' }, null, { url: '', title: 't', app: 'y' }] });
    expect(readShelf().map((p) => p.url)).toEqual(['/apps/proof/?problem=ok']);
  });

  it('broken json reads as empty', () => {
    store['iterra.v1.shelf'] = '{nope';
    expect(readShelf()).toEqual([]);
  });

  it('same-tab toggle notifies subscribers', () => {
    let calls = 0;
    const off = subscribeShelf(() => calls++);
    expect(calls).toBe(1); // initial emit
    togglePin(pin('z'));
    expect(calls).toBe(2);
    off();
    togglePin(pin('z'));
    expect(calls).toBe(2);
  });
});
