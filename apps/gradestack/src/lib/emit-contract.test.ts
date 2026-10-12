import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '../store';
import '../lib/iterra';

/* Pins the register emit contract (WIRING §7): bulk adoption is ONE stir,
   flagged sheets announce 'scanned — needs review' not a provisional
   'marked', and the flag-clear announces 'scan reviewed'. The ambient
   watcher binds at lib/iterra import — the hub stub installs via
   vi.hoisted so it exists first. zustand-persist degrades to in-memory
   under node (its "storage unavailable" stderr notes are expected). */

const env = vi.hoisted(() => {
  const calls: { text: string; url?: string; course?: string }[] = [];
  const fields: Record<string, any> = {};
  const iterra = {
    register: () => {},
    isFramed: () => false,
    open: () => {},
    openApp: () => {},
    feed: (item: any) => calls.push(item),
    doc: (ns: string) => ({
      get: () => null,
      set: () => {},
      subscribe: () => () => {},
      setField: (k: string, v: any) => { fields[`${ns}.${k}`] = v; },
    }),
  };
  const mem = new Map<string, string>();
  const ls = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  };
  (globalThis as any).localStorage = ls;
  (globalThis as any).window = {
    iterra,
    localStorage: ls,
  };
  return { calls, fields };
});

const mkTest = (id: string, name: string, courseName = 'MATH 241') =>
  ({ id, name, courseName, date: '2026-10-01', numQuestions: 5, format: 'A-D' as const, includeStudentId: false, createdAt: Date.parse('2026-10-01') });
const mkScan = (id: string, testId: string, needsReview = false, pct = 80, name = 'Ada Lovelace') =>
  ({ id, testId, studentId: 's1', studentName: name, rawScore: 4, maxScore: 5, percentage: pct, grade: 'B', needsReview, createdAt: Date.parse('2026-10-02') });

beforeEach(() => {
  env.calls.length = 0;
  useStore.setState({ tests: [], scans: [], _mergedIds: null });
});

describe('register emit contract', () => {
  it('mergeRemote: one register synced stir, zero per-row emits, markbook honest', () => {
    const remoteTests = [mkTest('tA', 'Quiz A'), mkTest('tB', 'Quiz B')];
    const remoteScans = [mkScan('s1', 'tA'), mkScan('s2', 'tA', true), mkScan('s3', 'tB')];
    useStore.getState().mergeRemote(remoteTests as any, remoteScans as any);
    expect(env.calls).toEqual([{ text: 'register synced: 5 records', url: '/apps/gradestack/', course: undefined }]);
    // merged ids suppressed for the watcher but still indexed in markbook —
    // newest scan belongs to tA (2 scans, 1 flagged → scored 1 of total 2)
    const mb = env.fields['shared.markbook'];
    expect(mb?.by).toBe('gradestack');
    expect(mb?.v).toEqual({ assessment: 'Quiz A', scored: 1, total: 2 });
  });

  it('importData: one register restored stir, zero per-row emits', () => {
    const json = JSON.stringify({ tests: [mkTest('tI', 'Imported Quiz')], scans: [mkScan('i1', 'tI'), mkScan('i2', 'tI')] });
    const n = useStore.getState().importData(json);
    expect(n).toBe(3);
    expect(env.calls).toEqual([{ text: 'register restored: 3 records', url: '/apps/gradestack/', course: undefined }]);
  });

  it('needsReview fork: flagged sheet announces scanned—needs review, clean announces marked', async () => {
    useStore.setState({ tests: [mkTest('tX', 'Fork Quiz') as any], scans: [] });
    env.calls.length = 0;
    await useStore.getState().addScan(mkScan('f1', 'tX', true) as any);
    await useStore.getState().addScan(mkScan('c1', 'tX', false, 100, 'Clean Carol') as any);
    expect(env.calls).toEqual([
      { text: 'scanned: Fork Quiz — needs review', url: '/apps/gradestack/', course: 'MATH 241' },
      { text: 'marked: Fork Quiz · 100%', url: '/apps/gradestack/', course: 'MATH 241' },
    ]);
    const mb = env.fields['shared.markbook'];
    expect(mb?.v).toEqual({ assessment: 'Fork Quiz', scored: 1, total: 2 });
  });

  it('flag-clear announces scan reviewed with the trusted grade', async () => {
    const t = mkTest('tR', 'Review Quiz');
    useStore.setState({ tests: [t as any], scans: [mkScan('r1', 'tR', true, 67) as any] });
    env.calls.length = 0;
    await useStore.getState().updateScan('r1', { needsReview: false, percentage: 100, rawScore: 5 });
    expect(env.calls).toEqual([
      { text: 'scan reviewed: Ada Lovelace · 100%', url: `/apps/gradestack/?assessment=tR`, course: 'MATH 241' },
    ]);
  });

  it('post-merge local adds still emit — suppression does not leak', async () => {
    useStore.getState().mergeRemote([mkTest('tA', 'Quiz A')] as any, [mkScan('s1', 'tA')] as any);
    env.calls.length = 0;
    await useStore.getState().addScan(mkScan('local1', 'tA') as any);
    expect(env.calls).toEqual([{ text: 'marked: Quiz A · 80%', url: '/apps/gradestack/', course: 'MATH 241' }]);
  });
});
