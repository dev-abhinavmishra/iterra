// Contract pin — Timer's canonical-store adapter (workflow D middle):
// session entity/event builders, the timer.start deep link, and the
// saveSession → entity+event mirror. window.iterra + localStorage are
// stubbed before the module under test is imported.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Ent = Record<string, any>;
let puts: Ent[];
let emits: { t: string; p: any }[];
let adapterOpts: any;
let listeners: Record<string, ((e: any) => void)[]>;

const installStubs = () => {
  puts = [];
  emits = [];
  adapterOpts = null;
  listeners = {};
  const mem = new Map<string, string>();
  const localStorageStub = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  };
  (globalThis as any).localStorage = localStorageStub;
  (globalThis as any).CustomEvent = class CustomEvent {
    type: string; detail: any;
    constructor(type: string, init?: { detail?: any }) { this.type = type; this.detail = init?.detail; }
  };
  (globalThis as any).window = {
    iterra: {
      register: vi.fn(),
      adapter: (o: any) => { adapterOpts = o; },
      store: {
        put: async (e: Ent) => { puts.push(e); return { ok: true }; },
        get: async () => null,
        list: async () => [],
      },
      events: { emit: (t: string, p: any) => emits.push({ t, p }) },
      courses: { resolve: async () => null },
      send: async () => ({ ok: true, delivered: 'queued' }),
    },
    document: { title: '' },
    location: { search: '', href: 'http://localhost/apps/timer/' },
    history: { replaceState: () => {} },
    localStorage: localStorageStub,
    addEventListener: (t: string, cb: (e: any) => void) => { (listeners[t] ??= []).push(cb); },
    dispatchEvent: (e: any) => { (listeners[e.type] || []).forEach((cb) => cb(e)); return true; },
    CustomEvent: (globalThis as any).CustomEvent,
  };
};

const tick = () => new Promise((r) => setTimeout(r, 5));

beforeEach(() => {
  vi.resetModules();
  installStubs();
});

describe('session entity + event builders', () => {
  it('maps a focus session onto {type:session} with the documented data', async () => {
    const { sessionEntity } = await import('./iterra-adapter');
    const e = sessionEntity(
      { id: 's1', duration: 1500, type: 'focus', timestamp: 1_000_000, label: 'Ch 4', commitmentId: 'cm1' } as any,
      { courseId: 'syllabus:course:c1', course: 'BIO' },
    );
    expect(e).toMatchObject({
      app: 'timer', type: 'session', id: 's1',
      courseId: 'syllabus:course:c1', course: 'BIO',
      title: 'Ch 4', sub: '25m', url: '/apps/timer/', createdAt: 1_000_000,
      data: { minutes: 25, label: 'Ch 4', commitmentId: 'cm1', startedAt: -500000, endedAt: 1_000_000 },
    });
  });

  it('falls back to preset and carries the bound course through', async () => {
    const { sessionEntity, sessionCompletedEvent } = await import('./iterra-adapter');
    const s = { id: 's2', duration: 600, type: 'focus', timestamp: 5_000, preset: 'Pomodoro' } as any;
    expect(sessionEntity(s).title).toBe('Pomodoro');
    const ev = sessionCompletedEvent(s);
    expect(ev).toMatchObject({ sessionId: 's2', minutes: 10, text: 'focus · 10m — Pomodoro' });
  });
});

describe('timer.start url builder', () => {
  it('builds the bound deep link the app parser already reads', async () => {
    const { timerStartUrl } = await import('./iterra-adapter');
    const url = timerStartUrl('syllabus', {
      label: 'Read chapter 4', minutes: 30, course: 'BIO',
      commitmentId: 'cm1', courseId: 'syllabus:course:c1',
    });
    const q = new URLSearchParams(url.split('?')[1]);
    expect(url.startsWith('/apps/timer/?')).toBe(true);
    expect(q.get('intent')).toBe('Read chapter 4');
    expect(q.get('minutes')).toBe('30');
    expect(q.get('course')).toBe('BIO');
    expect(q.get('from')).toBe('syllabus');
    expect(q.get('commitment')).toBe('cm1');
    expect(q.get('courseId')).toBe('syllabus:course:c1');
    expect(q.get('autostart')).toBe('1');
  });

  it('rejects a malformed sender and out-of-range minutes', async () => {
    const { timerStartUrl } = await import('./iterra-adapter');
    const q = new URLSearchParams(timerStartUrl('NOT_AN_APP', { minutes: 9999 }).split('?')[1]);
    expect(q.get('from')).toBe('terrain');
    expect(q.get('minutes')).toBeNull(); // falls through to the app default
  });

  it('round-trips through parseSyllabusLink — bound ids survive', async () => {
    const { timerStartUrl } = await import('./iterra-adapter');
    const { parseSyllabusLink } = await import('./deeplink');
    const link = parseSyllabusLink(timerStartUrl('ink', {
      label: 'Write', minutes: 45, courseId: 'syllabus:course:c9', commitmentId: 'b9',
    }).slice('/apps/timer/'.length));
    expect(link).toMatchObject({
      intent: 'Write', minutes: 45, from: 'ink',
      courseId: 'syllabus:course:c9', commitmentId: 'b9', autostart: true,
    });
  });
});

describe('adapter wiring', () => {
  it('publishes a focus session and emits session.completed on save', async () => {
    await import('./iterra-adapter');
    expect(adapterOpts?.name).toBe('timer');
    const { saveSession } = await import('./stats');
    saveSession({ duration: 1500, type: 'focus', label: 'Ch 4', commitmentId: 'cm7' } as any);
    await tick();
    expect(puts.find((e) => e.type === 'session')).toMatchObject({
      app: 'timer', id: expect.any(String), title: 'Ch 4', sub: '25m',
      data: { minutes: 25, commitmentId: 'cm7' },
    });
    expect(emits.find((e) => e.t === 'session.completed')).toMatchObject({
      p: { minutes: 25, text: 'focus · 25m — Ch 4' },
    });
  });

  it('ignores non-focus sessions', async () => {
    await import('./iterra-adapter');
    const { saveSession } = await import('./stats');
    saveSession({ duration: 300, type: 'break' } as any);
    await tick();
    expect(puts).toHaveLength(0);
    expect(emits).toHaveLength(0);
  });

  it('timer.start intake returns a deep link', async () => {
    await import('./iterra-adapter');
    const res = await adapterOpts.intakes['timer.start']({
      from: 'syllabus',
      payload: { label: 'Problem set', minutes: 20, course: 'MTH', commitmentId: 'cm3' },
    });
    expect(res.url).toContain('/apps/timer/?');
    const q = new URLSearchParams(res.url.split('?')[1]);
    expect(q.get('commitment')).toBe('cm3');
    expect(q.get('autostart')).toBe('1');
  });
});
