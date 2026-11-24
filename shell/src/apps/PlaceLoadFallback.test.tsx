// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ phase: 'preparing' as string, error: undefined as string | undefined }));

vi.mock('./index', () => ({
  usePlaceLoadSnapshot: () => ({ phase: state.phase, error: state.error }),
}));

import { PlaceLoadFallback } from './PlaceLoadFallback';

function renderFallback(placeId = 'rhythm', placeName = 'Attendance') {
  return renderToStaticMarkup(createElement(PlaceLoadFallback, {
    placeId,
    placeName,
    onRetry: () => {},
  }));
}

describe('PlaceLoadFallback', () => {
  beforeEach(() => {
    state.phase = 'preparing';
    state.error = undefined;
  });

  it('announces an indeterminate loading state with the place identity and no fabricated progress', () => {
    const html = renderFallback();

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('the Register');
    expect(html).toContain('Getting Attendance ready for this session');
    expect(html).not.toMatch(/progress|percent|\d+%/i);
  });

  it('keeps the failure message plain and leaves retry controls outside the status region', () => {
    state.phase = 'error';
    state.error = 'ChunkLoadError: internal build artifact failed';
    const html = renderFallback();

    expect(html).toContain('Couldn’t open Attendance');
    expect(html).toContain('Try again. If the problem continues, reload the workspace.');
    expect(html).toContain('>Retry<');
    expect(html).not.toContain('Technical details');
    expect(html).not.toContain(state.error);
  });
});
