import { afterEach, describe, expect, it, vi } from 'vitest';

const makeStorage = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('timer sound preferences', () => {
  it('keeps second-by-second ticking off for fresh settings', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', makeStorage());

    const { getSettings } = await import('./settings');

    expect(getSettings().sound).toBe(true);
    expect(getSettings().ticks).toBe(false);
  });

  it('defaults old saved settings without an explicit tick choice to ticking off', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', makeStorage({
      'timer.settings.v1': JSON.stringify({ accent: 'Signal', sound: true }),
    }));

    const { getSettings } = await import('./settings');

    expect(getSettings()).toMatchObject({ accent: 'Signal', sound: true, ticks: false });
  });

  it('retains an explicit opt-in to second ticks', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', makeStorage({
      'timer.settings.v1': JSON.stringify({ sound: true, ticks: true }),
    }));

    const { getSettings } = await import('./settings');

    expect(getSettings().ticks).toBe(true);
  });

  it('does not start tick audio unless ticking is explicitly enabled', async () => {
    const audioContext = vi.fn();
    vi.stubGlobal('window', { AudioContext: audioContext });

    const { secondTick, setTickingEnabled } = await import('./sound');

    secondTick();
    expect(audioContext).not.toHaveBeenCalled();

    setTickingEnabled(true);
    secondTick();
    expect(audioContext).toHaveBeenCalledOnce();
  });
});
