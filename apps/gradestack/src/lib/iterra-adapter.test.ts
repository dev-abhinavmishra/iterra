// Contract pin — the canonical-store mirror + intakes from iterra-adapter.ts.
// Runs in plain node: window.iterra + localStorage are stubbed BEFORE the
// module under test is imported (its subscribe/adapter() calls wire at import
// time); vi.resetModules per test re-baselines the adapter's diff memory.
import { beforeEach, describe, expect, it, vi } from 'vitest';

let puts: any[];
let removes: string[];
let events: { type: string; payload: any }[];
let entities: Map<string, any>;
let adapterOpts: any;
let byCode: (code: string) => Promise<any>;
let getImpl: (key: string) => Promise<any>;
let listImpl: (f: any) => any[];

const installStubs = () => {
  puts = [];
  removes = [];
  events = [];
  entities = new Map();
  adapterOpts = null;
  byCode = () => Promise.resolve(null);
  getImpl = () => Promise.resolve(null);
  listImpl = () => [];
  const mem = new Map<string, string>();
  const localStorageStub = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  };
  (globalThis as Record<string, unknown>).localStorage = localStorageStub;
  (globalThis as Record<string, unknown>).window = {
    iterra: {
      register: vi.fn(),
      adapter: (o: any) => {
        adapterOpts = o;
        return { name: o.name };
      },
      feed: () => {},
      doc: () => ({ get: () => null, set: () => {}, setField: () => {}, subscribe: () => () => {} }),
      store: {
        put: (e: any) => {
          puts.push(e);
          entities.set(`${e.app}:${e.type}:${e.id}`, e);
          return Promise.resolve({ ok: true });
        },
        get: (k: string) => getImpl(k),
        list: (f: any) => Promise.resolve(listImpl(f)),
        remove: (k: string) => {
          removes.push(k);
          entities.delete(k);
          return Promise.resolve({ ok: true });
        },
        subscribe: () => () => {},
        search: () => Promise.resolve([]),
      },
      events: {
        emit: (type: string, payload: any) => {
          events.push({ type, payload });
          return Promise.resolve({ ok: true });
        },
        list: () => Promise.resolve([]),
        on: () => () => {},
      },
      courses: { byCode: (code: string) => byCode(code), list: () => Promise.resolve([]) },
      send: () => Promise.resolve({ ok: true, delivered: 'direct', url: '/apps/timer/' }),
      open: () => {},
      isFramed: () => true,
    },
    localStorage: localStorageStub,
    location: { href: 'http://localhost/apps/gradestack/', search: '' },
    history: { replaceState: () => {} },
  };
};

const mkTest = (id: string, name: string, courseName = 'MTH') =>
  ({ id, name, courseName, date: '2026-10-01', numQuestions: 5, format: 'A-D' as const, includeStudentId: false, createdAt: Date.parse('2026-10-01') });
const mkScan = (id: string, testId: string, over: Record<string, any> = {}) =>
  ({
    id, testId, studentId: 's1', studentName: 'Ada Lovelace', rawScore: 4, maxScore: 5,
    percentage: 80, grade: 'B', needsReview: false, createdAt: Date.parse('2026-10-02'), ...over,
  });
const tick = () => new Promise((r) => setTimeout(r, 10));

const seedAndWire = async (data: Record<string, any>) => {
  const { useStore } = await import('../store');
  useStore.setState({ tests: [], scans: [], _mergedIds: null, ...data } as any);
  const adapter = await import('./iterra-adapter');
  return { useStore, adapter };
};

beforeEach(() => {
  vi.resetModules();
  installStubs();
});

describe('gradestack canonical-store mirror', () => {
  it('mirrors assessments + scored sheets in the documented shape', async () => {
    await seedAndWire({
      tests: [mkTest('t1', 'Quiz 1')],
      scans: [mkScan('s1', 't1'), mkScan('s2', 't1', { needsReview: true, studentName: 'Grace Hopper' })],
    });

    const assessment = entities.get('gradestack:assessment:t1');
    expect(assessment).toMatchObject({
      type: 'assessment', id: 't1', title: 'Quiz 1', course: 'MTH',
      sub: '2 marked', url: '/apps/gradestack/?assessment=t1',
    });
    expect(assessment.data).toMatchObject({ numQuestions: 5, format: 'A-D', courseName: 'MTH' });

    const grade = entities.get('gradestack:grade:s1');
    expect(grade).toMatchObject({
      type: 'grade', id: 's1', title: 'Quiz 1', course: 'MTH', sub: 'Ada Lovelace',
      url: '/apps/gradestack/scan?testId=t1&scanId=s1',
    });
    expect(grade.data).toMatchObject({ score: 4, max: 5, pct: 80, grade: 'B', testId: 't1' });
    expect(grade.data.enteredAt).toBe('2026-10-02T00:00:00.000Z');
    expect(entities.get('gradestack:grade:s2').data.needsReview).toBe(true);

    expect(events).toEqual([]); // baseline stays quiet
  });

  it('resolves courseId lazily through courses.byCode', async () => {
    byCode = (code: string) =>
      Promise.resolve(code.toLowerCase() === 'mth' ? { key: 'syllabus:course:c1', type: 'course' } : null);
    await seedAndWire({ tests: [mkTest('t1', 'Quiz 1')], scans: [mkScan('s1', 't1')] });
    await tick(); // byCode resolves → scheduled re-mirror stamps courseId
    expect(entities.get('gradestack:assessment:t1').courseId).toBe('syllabus:course:c1');
    expect(entities.get('gradestack:grade:s1').courseId).toBe('syllabus:course:c1');
  });

  it('never fabricates a courseId — unresolved stays absent and retried', async () => {
    await seedAndWire({ tests: [mkTest('t1', 'Quiz 1')], scans: [mkScan('s1', 't1')] });
    await tick();
    expect(entities.get('gradestack:grade:s1').courseId).toBeUndefined();
    // syllabus publishes later → next pass picks it up
    byCode = () => Promise.resolve({ key: 'syllabus:course:c9', type: 'course' });
    const { useStore } = await import('../store');
    useStore.setState({ tests: [...useStore.getState().tests] } as any);
    await tick();
    expect(entities.get('gradestack:grade:s1').courseId).toBe('syllabus:course:c9');
  });

  it('emits grade.entered for newly marked clean sheets, suppressed for merged ids', async () => {
    const { useStore } = await seedAndWire({ tests: [mkTest('t1', 'Quiz 1')] });
    await useStore.getState().addScan(mkScan('s1', 't1') as any);
    const newId = useStore.getState().scans[0].id; // addScan mints its own id
    const entered = events.filter((e) => e.type === 'grade.entered');
    expect(entered).toHaveLength(1);
    expect(entered[0].payload).toMatchObject({
      gradeId: newId, course: 'MTH', score: 80,
      text: 'grade entered: Quiz 1',
      url: `/apps/gradestack/scan?testId=t1&scanId=${newId}`,
    });
    // a bulk-synced scan is put into the store but not announced
    events.length = 0;
    useStore.getState().mergeRemote([], [mkScan('sM', 't1') as any]);
    expect(events.filter((e) => e.type === 'grade.entered')).toEqual([]);
    expect(entities.has('gradestack:grade:sM')).toBe(true);
  });

  it('emits grade.entered when a flagged sheet clears review', async () => {
    const { useStore } = await seedAndWire({
      tests: [mkTest('t1', 'Quiz 1')],
      scans: [mkScan('s1', 't1', { needsReview: true })],
    });
    await useStore.getState().updateScan('s1', { needsReview: false });
    const entered = events.filter((e) => e.type === 'grade.entered');
    expect(entered).toHaveLength(1);
    expect(entered[0].payload.gradeId).toBe('s1');
  });

  it('does not announce a sheet that stays flagged', async () => {
    const { useStore } = await seedAndWire({ tests: [mkTest('t1', 'Quiz 1')] });
    await useStore.getState().addScan(mkScan('s1', 't1', { needsReview: true }) as any);
    expect(events.filter((e) => e.type === 'grade.entered')).toEqual([]);
  });
});

describe('weights.import intake', () => {
  it('is registered and applies registry categories to matching tests', async () => {
    getImpl = (key: string) =>
      Promise.resolve(
        key === 'syllabus:course:c1'
          ? { key, type: 'course', course: 'MTH', data: { code: 'MTH', categories: { exam: 50, assignment: 30 } } }
          : null,
      );
    const { useStore } = await seedAndWire({
      tests: [mkTest('t1', 'Quiz 1', 'MTH'), mkTest('t2', 'Essay 1', 'ENG')],
    });
    const handler = adapterOpts?.intakes?.['weights.import'];
    expect(typeof handler).toBe('function');
    const res = await handler({ id: 'w1', action: 'weights.import', payload: { courseId: 'syllabus:course:c1' } });
    expect(res).toEqual({ url: '/apps/gradestack/?assessment=t1' });
    const tests = useStore.getState().tests;
    expect(tests.find((t) => t.id === 't1')?.weights).toEqual({ exam: 50, assignment: 30 });
    expect(tests.find((t) => t.id === 't2')?.weights).toBeUndefined();
  });

  it('returns {url:null} quietly when the course carries no weights', async () => {
    getImpl = () => Promise.resolve({ key: 'syllabus:course:c1', type: 'course', course: 'MTH', data: { code: 'MTH' } });
    await seedAndWire({ tests: [mkTest('t1', 'Quiz 1', 'MTH')] });
    const res = await adapterOpts.intakes['weights.import']({ id: 'w2', action: 'weights.import', payload: { courseId: 'syllabus:course:c1' } });
    expect(res).toEqual({ url: null });
  });

  it('returns {url:null} when no test matches the course', async () => {
    getImpl = () => Promise.resolve({ key: 'syllabus:course:c1', type: 'course', course: 'BIO', data: { code: 'BIO', categories: { exam: 100 } } });
    await seedAndWire({ tests: [mkTest('t1', 'Quiz 1', 'MTH')] });
    const res = await adapterOpts.intakes['weights.import']({ id: 'w3', action: 'weights.import', payload: { courseId: 'syllabus:course:c1' } });
    expect(res).toEqual({ url: null });
  });
});
