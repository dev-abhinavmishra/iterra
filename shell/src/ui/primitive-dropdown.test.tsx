// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { DropdownMenu } from './primitives';

it('keeps keyboard handling inside the open dropdown and supports leaving by Tab', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const keyDown = (element: Element, key: string) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    act(() => {
      element.dispatchEvent(event);
    });
    return event;
  };

  try {
    act(() => {
      root.render(
        <>
          <DropdownMenu trigger={(open, toggle) => (
            <button id="trigger" type="button" aria-expanded={open} onClick={toggle}>Options</button>
          )}>
            {(close) => (
              <>
                <button id="first" type="button" onClick={() => close({ restoreFocus: true })}>First action</button>
                <button id="last" type="button">Last action</button>
              </>
            )}
          </DropdownMenu>
          <input id="outside" type="number" aria-label="Outside value" />
        </>,
      );
    });
    const trigger = host.querySelector<HTMLButtonElement>('#trigger')!;
    const outside = host.querySelector<HTMLInputElement>('#outside')!;

    act(() => trigger.click());
    expect(document.activeElement?.id).toBe('first');
    expect(keyDown(document.activeElement!, 'ArrowDown').defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('last');
    expect(keyDown(document.activeElement!, 'Escape').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    act(() => trigger.click());
    act(() => host.querySelector<HTMLButtonElement>('#first')!.click());
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    act(() => trigger.click());
    expect(keyDown(document.activeElement!, 'Tab').defaultPrevented).toBe(false);
    // jsdom does not move focus on Tab, so move it to the next outside element.
    act(() => outside.focus());
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(keyDown(outside, 'ArrowUp').defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(outside);
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
