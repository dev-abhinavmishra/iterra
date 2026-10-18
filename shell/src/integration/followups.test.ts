// Contract pin — follow-up task lifecycle reconciliation.
//   scheduled + block stamped done → follow-up completes (any path: folio
//     stamp, Today check-off, intake — all republish the canonical entity)
//   scheduled + block gone (after publish-lag grace) → back to 'open' so
//     Today's Review Queue re-surfaces it instead of dropping it silently
//   scheduled + fresh task + block not yet mirrored → untouched (no flap)
//   open/completed/dismissed → reconciler never touches them
import { beforeEach, describe, expect, it, vi } from 'vitest';

let store: Map<string, string>;
let puts: Record<string, unknown>[];

const localStorageStub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  get length() { return store.size; },
  key: (i: number) => [...store.keys()][i] ?? null,
};

const installStubs = () => {
  store = new Map();
  puts = [];
  (globalThis as Record<string, unknown>).localStorage = localStorageStub;
  (globalThis as Record<string, unknown>).window = {
    iterra: {
      ready: Promise.resolve(),
      store: {
        put: (e: Record<string, unknown>) => { puts.push(e); return Promise.resolve({ ok: true }); },
      },
    },
  };
};

const load = async () => {
  vi.resetModules();
  return import('./identity');
};

type Task = import('./types').FollowUpTask;
const task = (over: Partial<Task>): Task => ({
  id: 'fu1',
  key: 'proof:followup:fu1',
  app: 'proof',
  title: 'Retry related rates',
  status: 'scheduled',
  sourceRef: 'proof:attempt:a1',
  targetRef: 'proof:problem:p1',
  scheduledBlockRef: 'syllabus:block:b1',
  createdAt: Date.now() - 120_000,
  updatedAt: Date.now() - 120_000,
  ...over,
});

const block = (id: string, state: string) => ({
  app: 'syllabus',
  type: 'block',
  id,
  data: { state },
});

const seedTasks = async (tasks: Task[]) => {
  const id = await load();
  store.set('iterra.v1.followups', JSON.stringify(Object.fromEntries(tasks.map((t) => [t.key, t]))));
  return id;
};

const readTask = (key: string): Task =>
  (JSON.parse(store.get('iterra.v1.followups')!) as Record<string, Task>)[key];

beforeEach(installStubs);

describe('reconcileFollowUps', () => {
  it('completes a scheduled follow-up when its block stamped done', async () => {
    const id = await seedTasks([task({})]);
    await id.reconcileFollowUps([block('b1', 'done')]);
    expect(readTask('proof:followup:fu1').status).toBe('completed');
    /* canonical entity republishes with the closed status */
    const put = puts.find((p) => p.type === 'followup' && p.id === 'fu1');
    expect((put?.data as Record<string, unknown>)?.status).toBe('completed');
  });

  it('leaves a scheduled follow-up alone while its block is still live', async () => {
    const id = await seedTasks([task({})]);
    await id.reconcileFollowUps([block('b1', 'planned'), block('b1', 'missed')]);
    expect(readTask('proof:followup:fu1').status).toBe('scheduled');
  });

  it('reopens a scheduled follow-up whose block vanished (after grace)', async () => {
    const id = await seedTasks([task({})]);
    /* another block proves syllabus has mirrored — b1 is genuinely gone */
    await id.reconcileFollowUps([block('other', 'planned')]);
    const t = readTask('proof:followup:fu1');
    expect(t.status).toBe('open');
    expect(t.scheduledBlockRef).toBeUndefined();
  });

  it('does not flap a fresh follow-up during publish lag', async () => {
    const id = await seedTasks([task({ updatedAt: Date.now() })]);
    await id.reconcileFollowUps([block('other', 'planned')]);
    const t = readTask('proof:followup:fu1');
    expect(t.status).toBe('scheduled');
    expect(t.scheduledBlockRef).toBe('syllabus:block:b1');
  });

  it('does not reopen when syllabus has never mirrored blocks', async () => {
    const id = await seedTasks([task({})]);
    await id.reconcileFollowUps([]);
    expect(readTask('proof:followup:fu1').status).toBe('scheduled');
  });

  it('never touches open, completed, or dismissed follow-ups', async () => {
    const id = await seedTasks([
      task({ key: 'proof:followup:open1', id: 'open1', status: 'open', scheduledBlockRef: undefined }),
      task({ key: 'proof:followup:done1', id: 'done1', status: 'completed' }),
      task({ key: 'proof:followup:gone1', id: 'gone1', status: 'dismissed' }),
    ]);
    await id.reconcileFollowUps([block('b1', 'done')]);
    expect(readTask('proof:followup:open1').status).toBe('open');
    expect(readTask('proof:followup:done1').status).toBe('completed');
    expect(readTask('proof:followup:gone1').status).toBe('dismissed');
  });
});
