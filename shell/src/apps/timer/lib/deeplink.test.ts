import { describe, it, expect, afterEach } from 'vitest';
import { parseSyllabusLink, syllabusReturnUrl, parseRoutineLink } from './deeplink';

/* Timer inbound contract — the exact params syllabus/flashcards/terrain emit
   and the file-back return leg. The consume/strip half lives in TimerView's
   effect (search cleared after a valid parse) and is covered by the framed
   e2e; this pins the pure parse + return-build surface. */

afterEach(() => {
  delete (globalThis as any).window;
});

describe('parseSyllabusLink', () => {
  it('parses the full syllabus contract', () => {
    const l = parseSyllabusLink(
      '?intent=drill+parts&minutes=25&course=MTH&from=syllabus&block=b_42&return=https%3A%2F%2Fshell.example&autostart=1',
    );
    expect(l).toEqual({
      intent: 'drill parts',
      minutes: 25,
      course: 'MTH',
      block: 'b_42',
      returnUrl: 'https://shell.example',
      from: 'syllabus',
      autostart: true,
    });
  });

  it('requires a real `from` sender — missing, too short, or non-alpha rejects the whole link', () => {
    expect(parseSyllabusLink('?intent=x&minutes=25')).toBeNull();
    expect(parseSyllabusLink('?intent=x&from=s')).toBeNull();
    expect(parseSyllabusLink('?intent=x&from=Syllabus')).toBeNull();
    expect(parseSyllabusLink('?intent=x&from=app123')).toBeNull();
    expect(parseSyllabusLink('?intent=x&from=terrain')).not.toBeNull();
  });

  it('preserves any valid sender name, not just syllabus', () => {
    for (const from of ['flashcards', 'gradestack', 'rhythm', 'terrain']) {
      expect(parseSyllabusLink(`?from=${from}`)?.from).toBe(from);
    }
  });

  it('bounds minutes to 1–720 and rounds; junk degrades to undefined', () => {
    const base = '?from=syllabus&minutes=';
    expect(parseSyllabusLink(base + '25')?.minutes).toBe(25);
    expect(parseSyllabusLink(base + '1')?.minutes).toBe(1);
    expect(parseSyllabusLink(base + '720')?.minutes).toBe(720);
    // bounds check runs BEFORE rounding — 720.4 is out of range and rejects,
    // while 719.6 rounds up into range and accepts
    expect(parseSyllabusLink(base + '720.4')?.minutes).toBeUndefined();
    expect(parseSyllabusLink(base + '719.6')?.minutes).toBe(720);
    expect(parseSyllabusLink(base + '0')?.minutes).toBeUndefined();
    expect(parseSyllabusLink(base + '-5')?.minutes).toBeUndefined();
    expect(parseSyllabusLink(base + '721')?.minutes).toBeUndefined();
    expect(parseSyllabusLink(base + 'abc')?.minutes).toBeUndefined();
    expect(parseSyllabusLink(base)?.minutes).toBeUndefined();
  });

  it('empty strings degrade to undefined, not empty params', () => {
    const l = parseSyllabusLink('?from=syllabus&intent=&course=&block=&return=');
    expect(l).toEqual({
      intent: undefined,
      minutes: undefined,
      course: undefined,
      block: undefined,
      returnUrl: undefined,
      from: 'syllabus',
      autostart: false,
    });
  });

  it("autostart is literal '1' only", () => {
    expect(parseSyllabusLink('?from=syllabus&autostart=1')?.autostart).toBe(true);
    for (const v of ['true', 'yes', '0', '2', '']) {
      expect(parseSyllabusLink(`?from=syllabus&autostart=${v}`)?.autostart).toBe(false);
    }
    expect(parseSyllabusLink('?from=syllabus')?.autostart).toBe(false);
  });
});

describe('syllabusReturnUrl', () => {
  it('returns null without both returnUrl and block', () => {
    expect(syllabusReturnUrl({ block: 'b1' }, 30)).toBeNull();
    expect(syllabusReturnUrl({ returnUrl: 'https://x.example' }, 30)).toBeNull();
    expect(syllabusReturnUrl({}, 30)).toBeNull();
  });

  it('builds completedBlock + actual on a loopback return origin', () => {
    // standalone dev topology: syllabus on :3003 files back cross-origin
    (globalThis as any).window = { location: { origin: 'http://localhost:3005' } };
    const url = syllabusReturnUrl(
      { returnUrl: 'http://localhost:3003/apps/syllabus/', block: 'b_9' },
      30,
    );
    const u = new URL(url!);
    expect(u.origin).toBe('http://localhost:3003');
    expect(u.searchParams.get('completedBlock')).toBe('b_9');
    expect(u.searchParams.get('actual')).toBe('30');
  });

  it('rejects external-origin returns — only sibling apps file back', () => {
    (globalThis as any).window = { location: { origin: 'http://localhost:8090' } };
    for (const bad of ['https://evil.example', 'http://shell.example/apps/syllabus', '//cdn.example/x']) {
      expect(syllabusReturnUrl({ returnUrl: bad, block: 'b1' }, 10)).toBeNull();
    }
  });

  it('resolves terrain-relative returns against this origin', () => {
    (globalThis as any).window = { location: { origin: 'http://app.example' } };
    const url = syllabusReturnUrl({ returnUrl: '/apps/syllabus', block: 'b_9' }, 12.4);
    const u = new URL(url!);
    expect(u.origin).toBe('http://app.example');
    expect(u.pathname).toBe('/apps/syllabus');
    expect(u.searchParams.get('actual')).toBe('12'); // rounds
  });

  it('floors actual minutes at 1', () => {
    (globalThis as any).window = { location: { origin: 'http://app.example' } };
    const url = syllabusReturnUrl({ returnUrl: '/apps/syllabus', block: 'b1' }, 0.2);
    expect(new URL(url!).searchParams.get('actual')).toBe('1');
  });

  it('rejects non-http(s) returns — javascript:/data: would execute on navigation', () => {
    (globalThis as any).window = { location: { origin: 'http://app.example' } };
    for (const bad of ['javascript:alert(1)', 'data:text/html,<h1>x</h1>', 'file:///etc/passwd', 'vbscript:x']) {
      expect(syllabusReturnUrl({ returnUrl: bad, block: 'b1' }, 10)).toBeNull();
    }
  });

  it('a scheme-less junk string resolves same-origin (documented tolerance)', () => {
    (globalThis as any).window = { location: { origin: 'http://app.example' } };
    const url = syllabusReturnUrl({ returnUrl: ':://bad', block: 'b1' }, 10);
    // not null — ':://bad' parses as a path and resolves on this origin,
    // which can only 404/misroute, never execute
    expect(url).not.toBeNull();
    expect(new URL(url!).origin).toBe('http://app.example');
  });
});

describe('parseRoutineLink', () => {
  it('accepts a standalone ?routine=<name> — no from= gate', () => {
    expect(parseRoutineLink('?routine=Pomodoro')).toBe('Pomodoro');
    expect(parseRoutineLink('?routine=52%20%2F%2017')).toBe('52 / 17');
  });
  it('trims whitespace; empty/absent → null', () => {
    expect(parseRoutineLink('?routine=%20%20')).toBeNull();
    expect(parseRoutineLink('?routine=')).toBeNull();
    expect(parseRoutineLink('')).toBeNull();
    expect(parseRoutineLink('?from=syllabus&minutes=30')).toBeNull();
  });
  it('coexists with the syllabus contract', () => {
    expect(parseRoutineLink('?routine=Tabata&from=flashcards&intent=drill')).toBe('Tabata');
  });
});
