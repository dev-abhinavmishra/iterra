import { describe, expect, it, vi } from 'vitest';
import { installSupabaseSyncBootstrap } from './supabaseSyncBootstrap';

function makeHost(initial: string | null = null) {
  const listeners = new Map<string, Set<(event: any) => void>>();
  const host = {
    localStorage: { getItem: (key: string) => key === 'iterra.v1.sync.enabled' ? initial : null },
    addEventListener: (type: string, listener: (event: any) => void) => {
      let set = listeners.get(type);
      if (!set) { set = new Set(); listeners.set(type, set); }
      set.add(listener);
    },
    removeEventListener: (type: string, listener: (event: any) => void) => listeners.get(type)?.delete(listener),
    dispatch: (type: string, event: any) => { for (const fn of listeners.get(type) ?? []) fn(event); },
    setEnabled: (value: string | null) => { initial = value; },
  };
  return host;
}

describe('Supabase sync bootstrap', () => {
  it('does not load Supabase or start auth before consent', async () => {
    const host = makeHost();
    const watchItterraSync = vi.fn();
    const load = vi.fn(async () => ({ watchItterraSync }));
    const stop = installSupabaseSyncBootstrap(load, host);
    await Promise.resolve();
    expect(load).not.toHaveBeenCalled();
    expect(watchItterraSync).not.toHaveBeenCalled();

    host.setEnabled('1');
    host.dispatch('iterra:sync-consent-changed', { detail: { enabled: true } });
    await Promise.resolve();
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
    expect(watchItterraSync).toHaveBeenCalledTimes(1);
    stop();
  });

  it('loads the sync module on boot only when consent was already persisted', async () => {
    const host = makeHost('1');
    const watchItterraSync = vi.fn();
    const load = vi.fn(async () => ({ watchItterraSync }));
    installSupabaseSyncBootstrap(load, host);
    await Promise.resolve();
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
    expect(watchItterraSync).toHaveBeenCalledTimes(1);
  });
});
