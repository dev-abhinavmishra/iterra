import { afterEach, describe, expect, it, vi } from 'vitest';
import { motionEnabledFor, subscribeToMotionPreference } from './motionPreference';

describe('motionEnabledFor', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('follows live OS preference in system mode', () => {
    expect(motionEnabledFor('system', false)).toBe(true);
    expect(motionEnabledFor('system', true)).toBe(false);
  });

  it('keeps explicit Full and Reduced choices independent of the OS', () => {
    expect(motionEnabledFor('full', true)).toBe(true);
    expect(motionEnabledFor('reduced', false)).toBe(false);
  });

  it('subscribes to OS preference changes and cleans up the listener', () => {
    const media = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('window', { matchMedia: vi.fn(() => media) });
    const onChange = vi.fn();

    const unsubscribe = subscribeToMotionPreference(onChange);
    const listener = media.addEventListener.mock.calls[0][1];
    listener();
    unsubscribe();

    expect(onChange).toHaveBeenCalledOnce();
    expect(media.removeEventListener).toHaveBeenCalledWith('change', listener);
  });
});
