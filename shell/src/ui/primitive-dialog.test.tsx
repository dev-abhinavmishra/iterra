// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Dialog } from './primitives';

it('preserves dialog focus across callback changes and restores the opener on close', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const render = (open: boolean, onClose: () => void) => {
    act(() => {
      root.render(
        <>
          <button id="opener">Open</button>
          <Dialog open={open} onClose={onClose} title="Example">
            <button id="first">First</button>
            <button id="last">Last</button>
          </Dialog>
        </>,
      );
    });
    act(() => {
      vi.advanceTimersToNextFrame();
    });
  };

  try {
    const previousClose = vi.fn();
    const latestClose = vi.fn();
    render(false, previousClose);
    const opener = host.querySelector<HTMLButtonElement>('#opener')!;
    opener.focus();
    render(true, previousClose);
    expect(document.activeElement?.id).toBe('first');

    const last = host.querySelector<HTMLButtonElement>('#last')!;
    last.focus();
    render(true, latestClose);
    expect(document.activeElement).toBe(last);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }));
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Close dialog');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true }));
    expect(document.activeElement).toBe(last);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(latestClose).toHaveBeenCalledOnce();
    expect(previousClose).not.toHaveBeenCalled();
    render(false, latestClose);
    expect(document.activeElement).toBe(opener);
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
