// Contract pin — Proof's canonical-store adapter (workflow C):
// problem/attempt entity builders, the diverged event + retest card, and
// the step.append intake. window.iterra + localStorage stubbed before
// import; the zustand store is seeded per test.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Ent = Record<string, any>;
let puts: Ent[];
let emits: { t: string; p: any }[];
let sends: any[];
let adapterOpts: any;

const installStubs = () => {
  puts = [];
  emits = [];
  sends = [];
  adapterOpts = null;
  const mem = new Map<string, string>();
  const localStorageStub = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  };
  (globalThis as any).localStorage = localStorageStub;
  (globalThis as any).window = {
    iterra: {
      register: vi.fn(),
      adapter: (o: any) => { adapterOpts = o; },
      store: {
        put: async (e: Ent) => { puts.push(e); return { ok: true }; },
        list: async () => [],
        remove: async () => ({ ok: true }),
      },
      events: { emit: (t: string, p: any) => emits.push({ t, p }) },
      courses: { resolve: async () => null },
      send: async (o: any) => { sends.push(o); return { ok: true, delivered: 'queued' }; },
      doc: () => null,
    },
    location: { search: '', href: 'http://localhost/apps/proof/' },
    history: { replaceState: () => {} },
    localStorage: localStorageStub,
    addEventListener: () => {},
    document: { title: '' },
  };
};

const tick = () => new Promise((r) => setTimeout(r, 10));

const seed = async () => {
  const { useWorkbench } = await import('../store');
  useWorkbench.setState({
    booted: true,
    problems: {
      p1: {
        id: 'p1', courseId: 'c1', topic: 'kinematics', promptDoc: 'A ball falls. **Find** $v(t)$.',
        answerSpec: { kind: 'open' }, workedSolutionDoc: '', hints: [], tags: [],
        difficulty: 2, attachments: [], createdAt: '2026-10-01T00:00:00Z', archived: false,
      } as any,
    },
    courses: { c1: { id: 'c1', code: 'PHY', name: 'Physics', color: 'navy', createdAt: '', archived: false } as any },
    attempts: {
      a1: {
        id: 'a1', problemId: 'p1', startedAt: '2026-10-10T00:00:00Z',
        work: [{ id: 'w1', text: 'dropped $g$ sign' }], confidence: 3, hintLevel: 0, hintReveals: [],
      } as any,
    },
    errors: {},
  });
  return useWorkbench;
};

beforeEach(() => {
  vi.resetModules();
  installStubs();
});

describe('entity builders', () => {
  it('problemEntity carries title/topic/course and the ?problem= url', async () => {
    const { problemEntity } = await import('./iterra-adapter');
    const e = problemEntity(
      { id: 'p1', topic: 'integration', promptDoc: '## Find $\\int x^2$', createdAt: 't0' } as any,
      { courseId: 'syllabus:course:c1', course: 'MTH' },
    );
    expect(e).toMatchObject({
      app: 'proof', type: 'problem', id: 'p1',
      courseId: 'syllabus:course:c1', course: 'MTH', topic: 'integration',
      title: 'Find \\int x^2', sub: 'integration',
      url: '/apps/proof/?problem=p1', data: { topic: 'integration' },
    });
  });

  it('attemptEntity reports diverged/weak/error from its error records', async () => {
    const { attemptEntity } = await import('./iterra-adapter');
    const a = { id: 'a1', problemId: 'p1', startedAt: 't1', work: [], result: 'incorrect', submittedAt: 't2' } as any;
    const errs = [
      { id: 'e1', attemptId: 'a1', category: 'wrong-strategy', createdAt: 't3' } as any,
      { id: 'e2', attemptId: 'a1', category: 'none', createdAt: 't4' } as any,
    ];
    const e = attemptEntity(a, { topic: 'kinematics' } as any, errs, { courseId: 'k', course: 'PHY' });
    expect(e.data).toMatchObject({ problemId: 'p1', diverged: true, weak: ['wrong-strategy'], error: 'none' });
    expect(e.url).toBe('/apps/proof/?attempt=a1');
  });
});

describe('retest card honesty', () => {
  it('builds the misconception card with the divergent-step label', async () => {
    const { retestCard } = await import('./iterra-adapter');
    const card = retestCard(
      { attemptId: 'a1', category: 'algebra-arithmetic', repairCue: 'keep the units', divergentSteps: [0] } as any,
      { work: [{ text: 'dropped $g$ sign' }] } as any,
      { topic: 'kinematics' } as any,
    );
    expect(card).toMatchObject({
      q: 'What cue signals the algebra-arithmetic trap (kinematics)?',
      a: 'keep the units',
      ex: 'diverged at dropped g sign',
    });
  });

  it('returns null when there is nothing honest to test', async () => {
    const { retestCard } = await import('./iterra-adapter');
    expect(retestCard({ category: 'none', repairCue: 'x' } as any, undefined, undefined)).toBeNull();
    expect(retestCard({ category: 'conceptual-gap', repairCue: '' } as any, undefined, undefined)).toBeNull();
  });

  it('stepRefText names the entity and keeps its key traceable', async () => {
    const { stepRefText } = await import('./iterra-adapter');
    expect(stepRefText({ key: 'ink:note:n1', title: 'Chapter notes' }))
      .toBe('ref · Chapter notes (ink:note:n1)');
    expect(stepRefText({ key: 'flashcards:deck:d2' })).toBe('ref · flashcards:deck:d2 (flashcards:deck:d2)');
  });
});

describe('adapter wiring', () => {
  it('step.append appends a ref step to the open attempt and returns its url', async () => {
    await seed();
    await import('./iterra-adapter');
    const res = await adapterOpts.intakes['step.append']({ entity: { key: 'ink:note:n1', title: 'Chapter notes' } });
    const { useWorkbench } = await import('../store');
    const a = useWorkbench.getState().attempts.a1;
    expect(a.work[a.work.length - 1].text).toBe('ref · Chapter notes (ink:note:n1)');
    expect(res.url).toBe('/apps/proof/?attempt=a1');
  });

  it('step.append returns null when no attempt is open', async () => {
    const store = await seed();
    store.setState((s: any) => ({ attempts: { a1: { ...s.attempts.a1, submittedAt: 't9' } } }));
    await import('./iterra-adapter');
    const res = await adapterOpts.intakes['step.append']({ entity: { key: 'k' } });
    expect(res).toBeNull();
  });

  it('a filed error emits attempt.diverged and sends the retest card', async () => {
    const store = await seed();
    await import('./iterra-adapter');
    await tick();
    store.getState().fileError({
      attemptId: 'a1', category: 'wrong-strategy', divergence: '', repairCue: 'draw the free-body first',
      divergentSteps: [0],
    } as any);
    await tick();
    expect(emits.find((e) => e.t === 'attempt.diverged')).toMatchObject({
      p: { attemptId: 'a1', problemId: 'p1', topic: 'kinematics', text: 'attempt diverged — kinematics' },
    });
    const send = sends.find((s) => s.to === 'flashcards');
    expect(send).toMatchObject({
      action: 'problem.retest',
      entity: { app: 'proof', type: 'attempt', id: 'a1' },
      payload: { deckTitle: 'Retest · kinematics', cards: [{ a: 'draw the free-body first' }] },
    });
  });

  it('publishes problem + attempt entities through the store subscription', async () => {
    const store = await seed();
    await import('./iterra-adapter');
    await tick();
    store.setState((s: any) => ({ problems: { ...s.problems } })); // nudge
    await tick();
    expect(puts.find((e) => e.type === 'problem' && e.id === 'p1')).toMatchObject({
      course: 'PHY', topic: 'kinematics', title: expect.stringContaining('ball falls'),
    });
    expect(puts.find((e) => e.type === 'attempt' && e.id === 'a1')).toMatchObject({
      url: '/apps/proof/?attempt=a1', data: { diverged: false, problemId: 'p1' },
    });
  });
});
