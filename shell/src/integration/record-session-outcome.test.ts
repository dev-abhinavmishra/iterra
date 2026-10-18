// Contract pin — recordSessionOutcome outcome semantics.
//   canceled   → reconcile the bound block, emit focusSessionCanceled, but write
//                NO timer session row, NO hub session entity, NO practicedIn
//                edges (the stats/CSV machinery can't tell outcomes apart, so a
//                scrubbed run must not bank phantom focus time).
//   completed  → session row + hub entity + practicedIn edge to the block.
//   idempotencyKey → dedupes retries even when the sessionId differs.
// Runs in plain node: window.iterra + localStorage stubbed BEFORE the module
// under test is imported; vi.resetModules per test re-baselines module state.
import { beforeEach, describe, expect, it, vi } from 'vitest';

let store: Map<string, string>;
let puts: any[];
let linkAdds: any[];
let events: { type: string; payload: any }[];

const localStorageStub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

const installStubs = () => {
  store = new Map();
  puts = [];
  linkAdds = [];
  events = [];
  (globalThis as Record<string, unknown>).localStorage = localStorageStub;
  (globalThis as Record<string, unknown>).window = {
    iterra: {
      commands: { register: vi.fn() },
      events: {
        emit: (type: string, payload: any) => {
          events.push({ type, payload });
          return Promise.resolve({ ok: true });
        },
      },
      store: {
        put: (e: any) => {
          puts.push(e);
          return Promise.resolve({ ok: true, entity: e });
        },
        get: () => Promise.resolve(null),
        list: () => Promise.resolve([]),
      },
      links: {
        add: (l: any) => {
          linkAdds.push(l);
          return Promise.resolve({ ok: true, link: { key: `${l.from}|${l.kind}|${l.to}`, ...l } });
        },
      },
    },
    localStorage: localStorageStub,
    dispatchEvent: () => true,
    postMessage: () => {},
    location: { origin: 'http://localhost', href: 'http://localhost/' },
  };
};

const seedBlock = (over: Record<string, any> = {}) => {
  store.set(
    'syllabus.folio.v1',
    JSON.stringify({
      state: {
        blocks: {
          b1: {
            id: 'b1',
            commitmentId: 'c1',
            label: 'Review block',
            state: 'in-progress',
            plannedDate: '2026-01-10',
            plannedMinutes: 25,
            actualMinutes: 5,
            ...over,
          },
        },
        commitments: { c1: { id: 'c1', title: 'Deck prep', loggedMinutes: 5 } },
      },
      version: 1,
    }),
  );
};

const sessions = () => JSON.parse(store.get('timer.sessions.v1') || '[]');
const folioBlock = () => JSON.parse(store.get('syllabus.folio.v1')!).state.blocks.b1;

let handleRecordSessionOutcome: (input: any) => Promise<any>;

beforeEach(async () => {
  vi.resetModules();
  installStubs();
  ({ handleRecordSessionOutcome } = await import('./commands'));
});

describe('recordSessionOutcome', () => {
  it('completed outcome writes the session row, hub entity, and practicedIn edge', async () => {
    seedBlock();
    const res = await handleRecordSessionOutcome({
      sessionId: 's1',
      outcome: 'completed',
      elapsedSeconds: 1500,
      plannedMinutes: 25,
      blockId: 'b1',
      confirmedByUser: true,
    });
    expect(res.ok).toBe(true);
    expect(res.entity?.type).toBe('session');
    expect(sessions()).toHaveLength(1);
    expect(sessions()[0].id).toBe('s1');
    expect(sessions()[0].duration).toBe(1500);
    expect(puts.some((e) => e.type === 'session' && e.id === 's1')).toBe(true);
    expect(linkAdds).toHaveLength(1);
    expect(linkAdds[0].from).toBe('timer:session:s1');
    expect(linkAdds[0].to).toBe('syllabus:block:b1');
    expect(linkAdds[0].kind).toMatch(/practiced/i);
    expect(folioBlock().state).toBe('done');
    expect(events.map((e) => e.type)).toContain('session.completed');
  });

  it('canceled outcome writes no session row, entity, or edges — but reverts the block', async () => {
    seedBlock();
    const res = await handleRecordSessionOutcome({
      sessionId: 's_cancel',
      outcome: 'canceled',
      elapsedSeconds: 45,
      blockId: 'b1',
      commitmentId: 'c1',
      confirmedByUser: true,
    });
    expect(res.ok).toBe(true);
    expect(res.entity).toBeUndefined();
    expect(sessions().find((s: any) => s.id === 's_cancel')).toBeUndefined();
    expect(puts.some((e) => e.type === 'session')).toBe(false);
    expect(linkAdds).toHaveLength(0);
    expect(folioBlock().state).toBe('planned');
    expect(folioBlock().actualMinutes).toBe(5);
    expect(folioBlock().lastOutcome).toBe('canceled');
    expect(events.map((e) => e.type)).toContain('focusSessionCanceled');
    expect(events.map((e) => e.type)).not.toContain('session.completed');
  });

  it('idempotencyKey dedupes a retry even when the sessionId differs', async () => {
    const first = await handleRecordSessionOutcome({
      sessionId: 'sa',
      outcome: 'completed',
      elapsedSeconds: 1500,
      idempotencyKey: 'timer:sa',
    });
    const second = await handleRecordSessionOutcome({
      sessionId: 'sb',
      outcome: 'completed',
      elapsedSeconds: 1500,
      idempotencyKey: 'timer:sa',
    });
    expect(first.ok).toBe(true);
    expect(second.deduplicated).toBe(true);
    expect(sessions()).toHaveLength(1);
    expect(sessions()[0].id).toBe('sa');
  });

  it('at backfills the session timestamp — stats file it under the past day', async () => {
    const yesterday = Date.now() - 26 * 3600 * 1000;
    const res = await handleRecordSessionOutcome({
      sessionId: 's_back',
      outcome: 'completed',
      elapsedMinutes: 40,
      plannedMinutes: 40,
      at: yesterday,
      confirmedByUser: true,
    });
    expect(res.ok).toBe(true);
    expect(sessions()[0].timestamp).toBe(yesterday);
    const ent = puts.find((e) => e.type === 'session' && e.id === 's_back');
    expect(ent?.data?.endedAt).toBe(yesterday);
    expect(ent?.data?.startedAt).toBe(yesterday - 40 * 60 * 1000);
    /* the entity's own createdAt rides the study day too — a backfilled
       session shouldn't top Recent Work as if it happened just now */
    expect(ent?.createdAt).toBe(yesterday);
  });

  it('courseId binds the session to a canonical course', async () => {
    const res = await handleRecordSessionOutcome({
      sessionId: 's_c',
      outcome: 'completed',
      elapsedMinutes: 25,
      courseId: 'syllabus:course:bio201',
      confirmedByUser: true,
    });
    expect(res.ok).toBe(true);
    expect(sessions()[0].courseId).toBe('syllabus:course:bio201');
  });

  it('a foreign session outcome never touches another live session\'s restore blob', async () => {
    /* a live focus countdown's blob carries its own sessionId — an interval
       finish or manual backfill must not wipe it (or reload-restore dies) */
    store.set('timer.session.live.v1', JSON.stringify({ sessionId: 'live_A', endsAt: Date.now() + 60000 }));
    await handleRecordSessionOutcome({ sessionId: 's_other', outcome: 'completed', elapsedMinutes: 10 });
    expect(store.get('timer.session.live.v1')).toContain('live_A');
    /* ...but finishing the live session itself does clear it */
    await handleRecordSessionOutcome({ sessionId: 'live_A', outcome: 'completed', elapsedMinutes: 25 });
    expect(store.get('timer.session.live.v1')).toBeUndefined();
  });

  it('sessionKind stamps interval/stopwatch rows honestly', async () => {
    await handleRecordSessionOutcome({
      sessionId: 's_int', outcome: 'completed', elapsedSeconds: 600, sessionKind: 'interval',
    });
    expect(sessions()[0].type).toBe('interval');
    const ent = puts.find((e) => e.type === 'session' && e.id === 's_int');
    expect(ent?.data?.sessionKind).toBe('interval');
  });
});
