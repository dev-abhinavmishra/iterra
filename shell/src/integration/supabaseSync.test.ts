import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state: { session: any; authListener: ((event: string, session: any) => void) | null } = {
    session: { user: { id: 'browser-user' } }, authListener: null,
  };
  const initAuth = vi.fn(async () => {});
  const createPinnedSyncClient = vi.fn((_token: string) => ({}));
  const supabase = {
    auth: {
      onAuthStateChange: vi.fn((listener: (event: string, session: any) => void) => {
        state.authListener = listener;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      getSession: vi.fn(async () => ({ data: { session: state.session }, error: null })),
    },
  };
  return { state, initAuth, createPinnedSyncClient, supabase };
});

vi.mock('../apps/margin/services/supabaseClient', () => ({
  supabase: mocks.supabase,
  createPinnedSyncClient: mocks.createPinnedSyncClient,
}));
vi.mock('../apps/margin/services/usageService', () => ({ initAuth: mocks.initAuth }));

import { watchItterraSync, withSyncOwnerLock } from './supabaseSync';

function serialLocks() {
  let tail = Promise.resolve();
  return {
    request: async (_name: string, _options: { mode: 'exclusive' }, callback: () => Promise<any>) => {
      const before = tail;
      let release!: () => void;
      tail = new Promise<void>(resolve => { release = resolve; });
      await before;
      try { return await callback(); }
      finally { release(); }
    },
  } as unknown as Pick<LockManager, 'request'>;
}

describe('Supabase sync lifecycle', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    const handlers = new Map<string, Set<(event: any) => void>>();
    const sync = {
      setProviderAvailable: vi.fn(),
      attach: vi.fn(async () => ({ ok: true })),
      detach: vi.fn(),
      setPausedReason: vi.fn(),
      status: vi.fn(() => ({})),
    };
    const host = {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
      iterra: { sync },
      addEventListener: (type: string, fn: (event: any) => void) => {
        let set = handlers.get(type);
        if (!set) { set = new Set(); handlers.set(type, set); }
        set.add(fn);
      },
      removeEventListener: (type: string, fn: (event: any) => void) => handlers.get(type)?.delete(fn),
      dispatch: (type: string, event: any) => { for (const fn of handlers.get(type) ?? []) fn(event); },
      values,
    };
    vi.stubGlobal('window', host);
    vi.stubGlobal('navigator', { locks: serialLocks() });
    mocks.state.session = { user: { id: 'browser-user' }, access_token: 'token-a' };
    mocks.state.authListener = null;
    mocks.initAuth.mockClear();
    mocks.createPinnedSyncClient.mockClear();
    mocks.supabase.auth.onAuthStateChange.mockClear();
    mocks.supabase.auth.getSession.mockClear();
    (globalThis as any).__syncTestHost = host;
  });

  it('starts auth and attaches from consent without opening Margin', async () => {
    const host = (globalThis as any).__syncTestHost;
    watchItterraSync();
    expect(mocks.initAuth).not.toHaveBeenCalled();
    expect(host.iterra.sync.attach).not.toHaveBeenCalled();

    host.values.set('iterra.v1.sync.enabled', '1');
    host.dispatch('iterra:sync-consent-changed', { detail: { enabled: true } });
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(mocks.initAuth).toHaveBeenCalledTimes(1);
    expect(host.iterra.sync.attach).toHaveBeenCalledTimes(1);
    expect(host.iterra.sync.attach.mock.calls[0][0].name).toBe('supabase:browser-user');
    expect(host.values.get('iterra.v1.sync.owner')).toBe('browser-user');

    mocks.state.session = { user: { id: 'browser-user' }, access_token: 'token-b' };
    mocks.state.authListener?.('TOKEN_REFRESHED', mocks.state.session);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(host.iterra.sync.attach).toHaveBeenCalledTimes(2);
    expect(mocks.createPinnedSyncClient.mock.calls.map(([token]) => token)).toEqual(['token-a', 'token-b']);
  });

  it('serializes first-owner claims across tabs and keeps attach inside the lock', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const locks = serialLocks();
    const started: string[] = [];
    let active = 0;
    const claim = (uid: string) => withSyncOwnerLock(uid, async () => {
      active++;
      expect(active).toBe(1);
      started.push(uid);
      await new Promise(resolve => setTimeout(resolve, 5));
      active--;
      return 'attached';
    }, locks, storage);
    const results = await Promise.all([claim('uid-a'), claim('uid-b')]);
    expect(results.filter(result => result.ownerMatches)).toHaveLength(1);
    expect(started).toEqual([values.get('iterra.v1.sync.owner')]);
    expect(values.get('iterra.v1.sync.owner')).toBe(started[0]);
  });

  it('fails closed when cross-tab locks are unavailable', async () => {
    const storage = { getItem: () => null, setItem: vi.fn() };
    const work = vi.fn(async () => {});
    await expect(withSyncOwnerLock('uid-a', work, null as any, storage))
      .rejects.toThrow(/cannot coordinate sync ownership safely across tabs/);
    expect(work).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
