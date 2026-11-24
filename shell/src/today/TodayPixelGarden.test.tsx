// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getGardenDaypart, TodayPixelGarden } from './TodayPixelGarden';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it('maps the local clock to four dayparts at their transition boundaries', () => {
  const local = (hour: number, minute = 0) => new Date(2026, 5, 15, hour, minute);
  expect(getGardenDaypart(local(4, 59))).toBe('night');
  expect(getGardenDaypart(local(5))).toBe('morning');
  expect(getGardenDaypart(local(10, 59))).toBe('morning');
  expect(getGardenDaypart(local(11))).toBe('daytime');
  expect(getGardenDaypart(local(16, 59))).toBe('daytime');
  expect(getGardenDaypart(local(17))).toBe('evening');
  expect(getGardenDaypart(local(20, 59))).toBe('evening');
  expect(getGardenDaypart(local(21))).toBe('night');
  expect(getGardenDaypart(local(23, 59))).toBe('night');
});

it('uses the active Paper or Graphite palette and responds to a theme change', () => {
  act(() => root.render(<TodayPixelGarden theme="paper" />));
  const scene = host.querySelector<HTMLElement>('.today-pixel-garden');
  expect(scene?.dataset.theme).toBe('paper');
  expect(scene?.dataset.daypart).toBe(getGardenDaypart(new Date()));

  act(() => root.render(<TodayPixelGarden theme="graphite" />));
  expect(scene?.dataset.theme).toBe('graphite');
  expect(scene?.getAttribute('aria-hidden')).toBe('true');
});
