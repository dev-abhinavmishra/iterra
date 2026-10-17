// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { JSDOM } from 'jsdom';

/* ?deck= intake contract — index entities and shelf pins emit ?deck=<deck-id>
   (select that deck); legacy links carry ?deck=<localStorage-key> holding a
   {title,cards} blob. Plus the store-shape crash guard: old/foreign blobs
   must normalize, never white-screen boot.
   Runs the REAL app.js inside a fresh JSDOM per test — no mocks of the code
   under test, no listener/DOM leakage between tests. */

const dir = path.dirname(fileURLToPath(import.meta.url));
const appJs = readFileSync(path.join(dir, '..', 'app.js'), 'utf8');
const html = readFileSync(path.join(dir, '..', 'index.html'), 'utf8');
const bodyHtml = html
  .match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1]
  .replace(/<script[\s\S]*?<\/script>/gi, '') ?? '';

const STORE = 'cardfile.decks.v1';
const LAST = 'cardfile.lastDeck';

/* A fresh realm per boot: DOM seeded from the real index.html, platform
   stubs for what jsdom lacks, app.js evaluated in-realm, DOMContentLoaded
   fired to run boot(). */
function boot(url, storage = {}) {
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
    url: `http://localhost${url}`,
    runScripts: 'outside-only',
  });
  const w = dom.window;
  for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
  w.matchMedia = () => ({
    matches: false, media: '',
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  });
  w.LZString = { compressToEncodedURIComponent: () => 'x', decompressFromEncodedURIComponent: () => null };
  w.HTMLCanvasElement.prototype.getContext = () =>
    new Proxy({}, { get: () => () => ({ measureText: () => ({ width: 0 }) }) });
  w.requestAnimationFrame = () => 0;
  w.scrollTo = () => {};
  w.eval(appJs);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return w;
}

const deck = (title, cards = [{ q: 'q1', a: 'a1' }]) => ({ title, cards });

describe('?deck= intake', () => {
  it('?deck=<existing-id> selects that deck', () => {
    const w = boot('/?deck=d_ix', { [STORE]: JSON.stringify({ d_ix: deck('IxDeck'), d_other: deck('Other') }) });
    expect(w.localStorage.getItem(LAST)).toBe('d_ix');
    expect(w.document.body.textContent).toContain('IxDeck');
  });

  it('?deck=<localStorage-key> imports via the legacy path and selects the new deck', () => {
    const w = boot('/?deck=legacy_key_1', {
      [STORE]: '{}',
      legacy_key_1: JSON.stringify({ title: 'LegacyBox', cards: [{ question: 'Q?', definition: 'A!' }] }),
    });
    const decks = JSON.parse(w.localStorage.getItem(STORE));
    expect(Object.values(decks).some(d => d.title === 'LegacyBox')).toBe(true);
    expect(w.document.body.textContent).toContain('LegacyBox');
    const id = Object.keys(decks).find(k => decks[k].title === 'LegacyBox');
    expect(w.localStorage.getItem(LAST)).toBe(id);
  });

  it('an existing deck id outranks a same-named localStorage key', () => {
    const w = boot('/?deck=shared_name', {
      [STORE]: JSON.stringify({ shared_name: deck('RealDeck') }),
      shared_name: JSON.stringify({ title: 'ShadowDeck', cards: [] }),
    });
    expect(w.localStorage.getItem(LAST)).toBe('shared_name');
    const decks = JSON.parse(w.localStorage.getItem(STORE));
    expect(Object.values(decks).some(d => d.title === 'ShadowDeck')).toBe(false);
  });

  it('?deck=<missing> toasts the "stored deck is gone" path, no crash', () => {
    const w = boot('/?deck=nonexistent', { [STORE]: JSON.stringify({ d_a: deck('A') }) });
    expect(w.document.getElementById('toast').textContent).toMatch(/stored deck is gone/i);
    expect(w.document.body.textContent).toContain('A'); // library still renders
  });

  it('?deck=<key holding malformed json> toasts the failure path', () => {
    const w = boot('/?deck=badkey', { [STORE]: '{}', badkey: 'not{json' });
    expect(w.document.getElementById('toast').textContent).toMatch(/failed to load stored deck/i);
  });

  it('params strip on consume', () => {
    const w = boot('/?deck=k1', {
      [STORE]: '{}',
      k1: JSON.stringify({ title: 'Once', cards: [{ q: 'q', a: 'a' }] }),
    });
    expect(w.location.search).toBe(''); // replaceState cleared the params
  });
});

describe('?cards= intake', () => {
  /* senders (proof) build the link with URLSearchParams — the query value
     arrives already-decoded. Decoding AGAIN turned a literal '%' into a
     URIError that killed the whole import, and corrupted real '%20' text. */
  it('imports single-encoded cards carrying a literal %', () => {
    const w = boot('/?cards=' + encodeURIComponent('50% duty:half rate;x:y'));
    const decks = JSON.parse(w.localStorage.getItem(STORE));
    const d = Object.values(decks).find(x => x.title === 'Shared deck');
    expect(d).toBeTruthy();
    expect(d.cards.map(c => c.q)).toContain('50% duty');
    expect(d.cards.map(c => c.q)).toContain('x');
  });

  it("keeps literal '%20' in card text instead of re-decoding to a space", () => {
    const w = boot('/?cards=' + encodeURIComponent('code%20x:raw') + '&title=' + encodeURIComponent('Pct'));
    const decks = JSON.parse(w.localStorage.getItem(STORE));
    const d = Object.values(decks).find(x => x.title === 'Pct');
    expect(d.cards[0].q).toBe('code%20x');
  });

  it('a title/course with % survives instead of failing the import', () => {
    const w = boot('/?cards=' + encodeURIComponent('a:b') +
      '&title=' + encodeURIComponent('100% sure') + '&course=' + encodeURIComponent('MTH'));
    const decks = JSON.parse(w.localStorage.getItem(STORE));
    const d = Object.values(decks).find(x => x.title === '100% sure');
    expect(d).toBeTruthy();
    expect(d.course).toBe('MTH');
  });

  it('params strip on consume', () => {
    const w = boot('/?cards=' + encodeURIComponent('a:b'));
    expect(w.location.search).toBe('');
  });
});

describe('store-shape crash guard', () => {
  it('normalizes a stray-name deck, a non-object entry, and missing cards without throwing', () => {
    let w;
    expect(() => {
      w = boot('/', {
        [STORE]: JSON.stringify({
          ok: deck('Good'),
          stray: { name: 'NoTitle' },   // older shape: name not title, no cards
          junk: 42,                     // non-object row
        }),
      });
    }).not.toThrow();
    // normalization is in-memory — observable through the render:
    // 'stray' renders under its name-fallback title, 'junk' is dropped
    expect(w.document.body.textContent).toContain('Good');
    expect(w.document.body.textContent).toContain('NoTitle');
  });
});
