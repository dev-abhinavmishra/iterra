// Contract pin — margin's canonical-store adapter shapes.
// Pure helpers only: entity builders, first-line extraction, intake seeding.
// window is stubbed before import — iterra.ts wires its bridge at module load.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Deck, Note, Quiz } from './types';

type A = typeof import('./iterra-adapter');
let adapter: A;

/* cold dynamic import of the adapter graph pays real seconds on a loaded
   disk — the 10s hook default has timed out under load */
beforeAll(async () => {
  vi.stubGlobal('window', {});
  adapter = await import('./iterra-adapter');
}, 60000);

const note = (over: Partial<Note> = {}): Note => ({
  id: 'n1',
  title: 'Cell respiration',
  date: 'Oct 11, 2026',
  content: '# Glycolysis\n\nGlucose splits into pyruvate.',
  transcript: '',
  type: 'TEXT',
  tags: ['BIO'],
  lastAccessed: '2026-10-11T09:00:00Z',
  ...over,
});

describe('firstLine', () => {
  it('strips markdown + html and truncates', () => {
    expect(adapter.firstLine('# Title\n\nbody text')).toBe('Title body text');
    expect(adapter.firstLine('<p>Hello <b>world</b></p>')).toBe('Hello world');
    expect(adapter.firstLine('')).toBeUndefined();
    expect(adapter.firstLine(undefined)).toBeUndefined();
    expect(adapter.firstLine('x'.repeat(200))!.length).toBe(80);
  });
});

describe('entity builders', () => {
  it('note entity carries title/sub/course/data', () => {
    const e = adapter.noteEntity(note(), { course: 'BIO', courseId: 'syllabus:course:c1' });
    expect(e).toMatchObject({
      app: 'margin', type: 'note', id: 'n1', title: 'Cell respiration',
      sub: 'Glycolysis Glucose splits into pyruvate.',
      course: 'BIO', courseId: 'syllabus:course:c1',
      url: '/apps/margin/?note=n1',
    });
    const d = e.data as Record<string, unknown>;
    expect(d.updated).toBe('2026-10-11T09:00:00Z');
    expect(d.tags).toEqual(['BIO']);
  });

  it('untitled note falls back to a title', () => {
    const e = adapter.noteEntity(note({ title: '', content: '' }));
    expect(e.title).toBe('untitled');
    expect(e.sub).toBeUndefined();
  });

  it('deck + quiz entities carry counts', () => {
    const deck: Deck = { id: 'd1', title: 'Bio terms', createdAt: '2026-10-01', cards: [{ id: 'k', front: 'q', back: 'a', ease: 2.5, interval: 0, due: '', reps: 0, lapses: 0 }] };
    const de = adapter.deckEntity(deck);
    expect(de).toMatchObject({ app: 'margin', type: 'deck', id: 'd1', sub: '1 cards', url: '/apps/margin/?deck=d1' });
    const quiz: Quiz = { id: 'q1', title: 'Quiz 1', createdAt: '2026-10-02', questions: [{ question: 'q', options: [], answer: 'a' }], attempts: [{ at: 'x', score: 1, total: 1 }] };
    const qe = adapter.quizEntity(quiz);
    expect(qe).toMatchObject({ app: 'margin', type: 'quiz', id: 'q1', sub: '1 questions' });
    expect((qe.data as Record<string, unknown>).attempts).toBe(1);
  });
});

describe('Supabase sync adapter', () => {
  it('calls atomic put/remove RPCs and returns the exact owner-scoped stale winner', async () => {
    const rpcCalls: Array<[string, any]> = [];
    const filters: Array<[string, any]> = [];
    const tombstone = {
      key: 'margin:note:n1', body: { key: 'margin:note:n1', app: 'margin', type: 'note', id: 'n1', updatedAt: 12 },
      deleted: true, deletedAt: 20, synced_at: new Date(30).toISOString(),
    };
    const sb = {
      rpc: vi.fn(async (name: string, args: any) => { rpcCalls.push([name, args]); return { data: 'stale', error: null }; }),
      from: (_table: string) => ({
        select: () => ({
          eq: (column: string, value: any) => {
            filters.push([column, value]);
            return {
              eq: (nextColumn: string, nextValue: any) => {
                filters.push([nextColumn, nextValue]);
                return { maybeSingle: async () => ({ data: tombstone, error: null }) };
              },
            };
          },
        }),
      }),
    };
    const sync = adapter.createSupabaseSyncAdapter(sb, 'owner-1', { assertIdentity: async () => {} });
    const entity = { key: 'margin:note:n1', app: 'margin', type: 'note', id: 'n1', title: 'local', updatedAt: 10 };
    const putResult = await sync.put(entity);
    expect(rpcCalls[0]).toEqual(['iterra_entity_put', {
      p_key: entity.key, p_app: 'margin', p_type: 'note', p_course_id: null, p_updated_at: 10, p_body: entity,
    }]);
    expect(putResult).toMatchObject({ status: 'stale', remote: { key: entity.key, __deleted: true, deletedAt: 20 } });
    expect(filters).toEqual([['user_id', 'owner-1'], ['key', entity.key]]);

    const removeResult = await sync.remove(entity.key, 15);
    expect(rpcCalls[1]).toEqual(['iterra_entity_remove', { p_key: entity.key, p_deleted_at: 15 }]);
    expect(removeResult).toMatchObject({ status: 'stale', remote: { key: entity.key, __deleted: true } });
  });

  it('fails closed when the browser owner changes and detaches on sign-out', () => {
    expect(adapter.syncIdentityMatches(null, 'new-owner')).toBe(true);
    expect(adapter.syncIdentityMatches('owner-a', 'owner-a')).toBe(true);
    expect(adapter.syncIdentityMatches('owner-a', 'owner-b')).toBe(false);
    expect(adapter.syncAuthAction('SIGNED_OUT', null, true)).toBe('detach');
    expect(adapter.syncAuthAction('INITIAL_SESSION', null, true)).toBe('attach');
    expect(adapter.syncAuthAction('INITIAL_SESSION', null, false)).toBe('none');
    expect(adapter.syncAuthAction('SIGNED_IN', 'owner-a', true)).toBe('attach');
    expect(adapter.syncAuthAction('TOKEN_REFRESHED', 'owner-a', false)).toBe('none');
  });

  it('uses keyset paging so a concurrent row move cannot skip rows within the scan bound', async () => {
    const makeRow = (key: string, stamp: number, title = key) => ({
      key, body: { key, app: 'margin', type: 'note', id: key, title, updatedAt: stamp },
      deleted: false, deletedAt: null, synced_at: new Date(stamp).toISOString(), user_id: 'u1',
    });
    const rows = [makeRow('k-a', 1000), makeRow('k-b', 2000), makeRow('k-c', 2000), makeRow('k-d', 3000)];
    let mutated = false;
    class Query {
      filters: Array<[string, string, any]> = [];
      orders: Array<[string, boolean]> = [];
      limitCount = Infinity;
      constructor(private readonly fields: string) {}
      eq(column: string, value: any) { this.filters.push([column, 'eq', value]); return this; }
      gt(column: string, value: any) { this.filters.push([column, 'gt', value]); return this; }
      gte(column: string, value: any) { this.filters.push([column, 'gte', value]); return this; }
      lte(column: string, value: any) { this.filters.push([column, 'lte', value]); return this; }
      order(column: string, opts: any) { this.orders.push([column, !!opts.ascending]); return this; }
      limit(value: number) { this.limitCount = value; return this; }
      private result() {
        let result = rows.filter((row: any) => this.filters.every(([column, op, value]) => {
          const actual = column === 'synced_at' || column === 'key' ? row[column] : row[column];
          if (op === 'eq') return actual === value;
          if (op === 'gt') return actual > value;
          if (op === 'gte') return actual >= value;
          return actual <= value;
        }));
        result = result.sort((a: any, b: any) => {
          for (const [field, ascending] of this.orders) {
            if (a[field] === b[field]) continue;
            const cmp = a[field] < b[field] ? -1 : 1;
            return ascending ? cmp : -cmp;
          }
          return 0;
        }).slice(0, this.limitCount);
        return result;
      }
      async maybeSingle() { return { data: this.result()[0] ?? null, error: null }; }
      async range(from: number, to: number) {
        const result = this.result().slice(from, to + 1).map((row) => JSON.parse(JSON.stringify(row)));
        if (this.fields.includes('body') && !mutated) {
          mutated = true;
          rows.find((row: any) => row.key === 'k-b')!.synced_at = new Date(3000).toISOString();
          rows.find((row: any) => row.key === 'k-b')!.body = { ...rows.find((row: any) => row.key === 'k-b')!.body, title: 'k-b-moved', updatedAt: 3001 };
        }
        return { data: result, error: null };
      }
    }
    const sb = { from: (_table: string) => ({ select: (fields: string) => new Query(fields) }) };
    const sync = adapter.createSupabaseSyncAdapter(sb, 'u1', { pageSize: 2, fullScanEvery: 100, assertIdentity: async () => {} });
    const result = await sync.pull(0);
    const seen = result.rows.map((row: any) => row.key);
    expect(seen).toContain('k-c');
    expect(result.rows.some((row: any) => row.title === 'k-b-moved')).toBe(true);
    expect(seen).toContain('k-d');
  });

  it('runs a periodic full scan even when the incremental watermark is ahead', async () => {
    const row = {
      key: 'margin:note:reconcile', app: 'margin', type: 'note', id: 'reconcile', title: 'late',
      body: { key: 'margin:note:reconcile', app: 'margin', type: 'note', id: 'reconcile', title: 'late', updatedAt: 1 },
      deleted: false, deletedAt: null, synced_at: new Date(1000).toISOString(), user_id: 'u1',
    };
    const filters: Array<[string, string, any]> = [];
    class Query {
      local: Array<[string, string, any]> = [];
      constructor(_fields: string) {}
      eq(c: string, v: any) { this.local.push([c, 'eq', v]); return this; }
      gt(c: string, v: any) { this.local.push([c, 'gt', v]); return this; }
      gte(c: string, v: any) { this.local.push([c, 'gte', v]); if (c === 'synced_at') filters.push([c, 'gte', v]); return this; }
      lte(c: string, v: any) { this.local.push([c, 'lte', v]); return this; }
      order() { return this; }
      limit() { return this; }
      async maybeSingle() { return { data: row, error: null }; }
      async range() {
        const data = this.local.every(([c, op, v]) => {
          const actual = (row as any)[c];
          return op === 'eq' ? actual === v : op === 'gt' ? actual > v : op === 'gte' ? actual >= v : actual <= v;
        }) ? [row] : [];
        return { data, error: null };
      }
    }
    const sb = { from: (_table: string) => ({ select: (fields: string) => new Query(fields) }) };
    const sync = adapter.createSupabaseSyncAdapter(sb, 'u1', { fullScanEvery: 10, assertIdentity: async () => {} });
    let tenth: any;
    for (let i = 0; i < 10; i++) tenth = await sync.pull(100000);
    expect(filters).toHaveLength(10);
    expect(filters[9][2]).toBe(new Date(0).toISOString());
    expect(tenth.rows).toHaveLength(1);
  });
});

describe('note.create intake', () => {
  it('seeds a note from the sending entity + selection text', () => {
    const n = adapter.intakeNote({
      id: 'in-9', from: 'ink',
      entity: { app: 'ink', type: 'note', id: 'p1', title: 'Wet ink' },
      payload: { text: 'the selection' },
    });
    expect(n.id).toBe('intake-in-9');
    expect(n.title).toBe('Wet ink');
    expect(n.content).toContain('# Wet ink');
    expect(n.content).toContain('the selection');
    expect(n.tags).toEqual(['ink']);
    expect(n.type).toBe('TEXT');
  });
});
