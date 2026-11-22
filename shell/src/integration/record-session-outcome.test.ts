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
let failOutcomeLedgerWrite: boolean;
let failSessionEntityPut: boolean;
let nativePersistence: typeof import('./nativePersistence') | null = null;

const localStorageStub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    if (failOutcomeLedgerWrite && k === 'iterra.v1.sessionOutcomes') throw new Error('quota');
    store.set(k, String(v));
  },
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

const installStubs = () => {
  store = new Map();
  puts = [];
  linkAdds = [];
  events = [];
  failOutcomeLedgerWrite = false;
  failSessionEntityPut = false;
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
          if (failSessionEntityPut && e.app === 'timer' && e.type === 'session') {
            return Promise.resolve({ ok: false, error: 'offline' });
          }
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

const seedBlock = async (over: Record<string, any> = {}) => {
  await nativePersistence!.replaceNativeStores({
    'syllabus.folio.v1': {
      version: 1,
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
        courses: { course1: { id: 'course1', code: 'BIO 201' }, course2: { id: 'course2', code: 'BIO 202' } },
        commitments: {
          c1: { id: 'c1', title: 'Deck prep', type: 'assignment', status: 'open', courseId: 'course1', loggedMinutes: 5 },
          c2: { id: 'c2', title: 'Deck prep', type: 'assignment', status: 'open', courseId: 'course1', loggedMinutes: 3 },
          c3: { id: 'c3', title: 'Deck prep', type: 'assignment', status: 'open', courseId: 'course2', loggedMinutes: 4 },
        },
      },
    },
  });
};

const sessions = () => JSON.parse(store.get('timer.sessions.v1') || '[]');
const folioBlock = async () => (await nativePersistence!.readNativeStore('syllabus.folio.v1'))!.blocks.b1;
const folioCommitments = async () => (await nativePersistence!.readNativeStore('syllabus.folio.v1'))!.commitments;

let handleRecordSessionOutcome: (input: any) => Promise<any>;

beforeEach(async () => {
  if (nativePersistence) await nativePersistence.nativePersistenceTestReset();
  const deletion = indexedDB.deleteDatabase('iterra-native-state');
  await new Promise<void>((resolve, reject) => {
    deletion.onsuccess = () => resolve();
    deletion.onerror = () => reject(deletion.error ?? new Error('Could not reset native test database.'));
    deletion.onblocked = () => reject(new Error('Native test database reset was blocked.'));
  });
  vi.resetModules();
  installStubs();
  nativePersistence = await import('./nativePersistence');
  ({ handleRecordSessionOutcome } = await import('./commands'));
});

describe('recordSessionOutcome', () => {
  it('completed outcome writes the session row, hub entity, and practicedIn edge', async () => {
    await seedBlock();
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
    expect((await folioBlock()).state).toBe('done');
    expect((await folioCommitments()).c1.loggedMinutes).toBe(30);
    expect(events.map((e) => e.type)).toContain('session.completed');
  });

  it('credits a direct focus session to the bound assignment without changing its status', async () => {
    await seedBlock();
    const at = Date.UTC(2026, 0, 11);
    const input = {
      sessionId: 's_direct',
      idempotencyKey: 'timer:s_direct',
      outcome: 'completed',
      commitmentId: 'c1',
      elapsedSeconds: 420,
      plannedMinutes: 25,
      at,
    };
    const result = await handleRecordSessionOutcome(input);
    const retry = await handleRecordSessionOutcome(input);

    expect(result.ok).toBe(true);
    expect(result.url).toBe('/apps/syllabus/?commitment=c1');
    expect(retry.deduplicated).toBe(true);
    expect(sessions()).toHaveLength(1);
    expect((await folioCommitments()).c1).toMatchObject({
      loggedMinutes: 12,
      status: 'open',
      lastWorkedAt: new Date(at).toISOString(),
    });
    expect((await folioCommitments()).c2.loggedMinutes).toBe(3);
    expect((await folioCommitments()).c3.loggedMinutes).toBe(4);
    expect(await folioBlock()).toMatchObject({ state: 'in-progress', actualMinutes: 5 });
    expect(puts).toContainEqual(expect.objectContaining({
      app: 'syllabus',
      type: 'commitment',
      id: 'c1',
      courseId: 'syllabus:course:course1',
      course: 'BIO 201',
      data: expect.objectContaining({ loggedMinutes: 12, status: 'open' }),
    }));
  });

  it('credits partial time and ignores a canceled or empty direct session', async () => {
    await seedBlock();
    const commitmentId = 'c1';
    await handleRecordSessionOutcome({ sessionId: 'partial', outcome: 'partial', commitmentId, elapsedSeconds: 180 });
    await handleRecordSessionOutcome({ sessionId: 'canceled', outcome: 'canceled', commitmentId, elapsedSeconds: 45 });
    await handleRecordSessionOutcome({ sessionId: 'empty', outcome: 'partial', commitmentId, elapsedSeconds: 0 });
    expect((await folioCommitments()).c1).toMatchObject({ loggedMinutes: 8, status: 'open' });
    expect(puts.filter((row) => row.type === 'commitment')).toHaveLength(1);
  });

  it('credits concurrent outcomes for one session once even when delivery keys differ', async () => {
    await seedBlock();
    const input = {
      sessionId: 'same-session',
      outcome: 'completed',
      commitmentId: 'c1',
      elapsedMinutes: 7,
    };
    const [first, retry] = await Promise.all([
      handleRecordSessionOutcome({ ...input, idempotencyKey: 'timer:same-session' }),
      handleRecordSessionOutcome({ ...input, idempotencyKey: 'retry:same-session' }),
    ]);
    expect(first.ok).toBe(true);
    expect(retry.deduplicated).toBe(true);
    expect((await folioCommitments()).c1.loggedMinutes).toBe(12);
    expect(sessions()).toHaveLength(1);
  });

  it('does not double-credit when the outcome receipt write fails after the folio commit', async () => {
    await seedBlock();
    failOutcomeLedgerWrite = true;
    const input = {
      sessionId: 'receipt-retry',
      outcome: 'completed',
      blockId: 'b1',
      commitmentId: 'c1',
      elapsedMinutes: 7,
      idempotencyKey: 'timer:receipt-retry',
    };

    const failed = await handleRecordSessionOutcome(input);
    expect(failed).toMatchObject({ ok: false, code: 'OUTCOME_LEDGER_WRITE_FAILED' });
    expect((await folioBlock()).actualMinutes).toBe(12);
    expect((await folioCommitments()).c1.loggedMinutes).toBe(12);
    expect(events).toHaveLength(0);

    failOutcomeLedgerWrite = false;
    const recovered = await handleRecordSessionOutcome(input);
    expect(recovered.ok).toBe(true);
    expect((await folioBlock()).actualMinutes).toBe(12);
    expect((await folioCommitments()).c1.loggedMinutes).toBe(12);
    expect(events.map((event) => event.type)).toContain('session.completed');
  });

  it('rejects a different outcome for a session that already has a receipt', async () => {
    await seedBlock();
    const completed = await handleRecordSessionOutcome({
      sessionId: 'outcome-conflict', outcome: 'completed', blockId: 'b1', elapsedMinutes: 8,
    });
    const conflict = await handleRecordSessionOutcome({
      sessionId: 'outcome-conflict', outcome: 'partial', blockId: 'b1', elapsedMinutes: 8,
    });
    expect(completed.ok).toBe(true);
    expect(conflict).toMatchObject({ ok: false, code: 'OUTCOME_CONFLICT' });
    expect((await folioBlock()).actualMinutes).toBe(13);
    expect((await folioCommitments()).c1.loggedMinutes).toBe(13);
  });

  it('keeps an outcome retryable when the canonical session mirror fails', async () => {
    await seedBlock();
    failSessionEntityPut = true;
    const input = { sessionId: 'mirror-retry', outcome: 'completed', blockId: 'b1', elapsedMinutes: 6 };
    const failed = await handleRecordSessionOutcome(input);
    expect(failed).toMatchObject({ ok: false, code: 'SESSION_ENTITY_WRITE_FAILED' });
    expect((await folioBlock()).actualMinutes).toBe(5);

    failSessionEntityPut = false;
    const recovered = await handleRecordSessionOutcome(input);
    expect(recovered.ok).toBe(true);
    expect((await folioBlock()).actualMinutes).toBe(11);
  });

  it('keeps both outcome records when two sessions finish concurrently', async () => {
    await seedBlock();
    const first = { sessionId: 'first-session', outcome: 'completed', commitmentId: 'c1', elapsedMinutes: 7 };
    const second = { sessionId: 'second-session', outcome: 'completed', commitmentId: 'c1', elapsedMinutes: 4 };
    await Promise.all([handleRecordSessionOutcome(first), handleRecordSessionOutcome(second)]);
    expect((await folioCommitments()).c1.loggedMinutes).toBe(16);
    expect(sessions()).toHaveLength(2);
    expect((await handleRecordSessionOutcome(first)).deduplicated).toBe(true);
    expect((await handleRecordSessionOutcome(second)).deduplicated).toBe(true);
    expect((await folioCommitments()).c1.loggedMinutes).toBe(16);
  });

  it('preserves the session course while mirroring an assignment in its current course', async () => {
    await seedBlock();
    await handleRecordSessionOutcome({
      sessionId: 'moved-assignment',
      outcome: 'completed',
      commitmentId: 'c1',
      elapsedMinutes: 7,
      courseId: 'syllabus:course:former-course',
      course: 'BIO 101',
    });
    expect(sessions()[0]).toMatchObject({ courseId: 'syllabus:course:former-course', course: 'BIO 101' });
    expect(puts).toContainEqual(expect.objectContaining({
      type: 'commitment',
      id: 'c1',
      courseId: 'syllabus:course:course1',
      course: 'BIO 201',
    }));
  });

  it('canceled outcome writes no session row, entity, or edges — but reverts the block', async () => {
    await seedBlock();
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
    expect((await folioBlock()).state).toBe('planned');
    expect((await folioBlock()).actualMinutes).toBe(5);
    expect((await folioBlock()).lastOutcome).toBe('canceled');
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
    await seedBlock();
    /* a live focus countdown's blob carries its own sessionId — an interval
       finish or manual backfill must not wipe it (or reload-restore dies) */
    /* a live blob always carries running:true — a flag-less blob is a
       corpse both TimerView's mount-restore and the context revive sweep */
    store.set('timer.session.live.v1', JSON.stringify({
      sessionId: 'live_A', syllabus: { commitmentId: 'c1' }, running: true, endsAt: Date.now() + 60000,
    }));
    await handleRecordSessionOutcome({ sessionId: 's_other', outcome: 'completed', elapsedMinutes: 10 });
    expect(store.get('timer.session.live.v1')).toContain('live_A');
    expect(sessions()[0].commitmentId).toBeUndefined();
    expect((await folioCommitments()).c1.loggedMinutes).toBe(5);
    /* ...but finishing the live session itself does clear it */
    await handleRecordSessionOutcome({ sessionId: 'live_A', outcome: 'completed', elapsedMinutes: 25 });
    expect(store.get('timer.session.live.v1')).toBeUndefined();
    expect((await folioCommitments()).c1.loggedMinutes).toBe(30);
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
