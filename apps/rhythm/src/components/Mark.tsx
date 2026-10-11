// ── The stamped mark ─────────────────────────────────────────────────────────
// State lives in the SHAPE, not the color — the register must read at a glance
// in grayscale and to a screen reader.
//
//   full        ● solid round stamp with a check
//   minimum     ● small solid pellet — a real mark at the smaller bar
//   partial     ◐ ring half-inked
//   missed      ○ faint open ring
//   exception   ⊘ struck ring
//   paused      ‖ twin bars
//   unscheduled – a tick
//   future      · a light ring

import type { DayState } from '../lib/register';
import { cx } from '../lib/utils';

export function Mark({
  state,
  accent,
  size = 26,
  press = false,
  title,
}: {
  state: DayState;
  accent?: string; // 'acc-indigo' etc — the routine's ink
  size?: number;
  press?: boolean; // play the stamp-press once
  title?: string;
}) {
  const glyph = GLYPHS[state];
  return (
    <span
      className={cx('mark', `mark--${state}`, accent && `acc-${accent}`, press && 'mark--press')}
      style={{ width: size, height: size }}
      role="img"
      aria-label={title ?? state}
      title={title}
    >
      {glyph}
    </span>
  );
}

const S = 'currentColor';

const GLYPHS: Record<DayState, React.ReactNode> = {
  full: (
    <svg viewBox="0 0 26 26" width="100%" height="100%" aria-hidden="true">
      <circle cx="13" cy="13" r="9.6" fill={S} opacity="0.16" />
      <circle cx="13" cy="13" r="9.6" fill="none" stroke={S} strokeWidth="2.1" />
      <path d="M8.6 13.4l3 3 5.8-6.4" fill="none" stroke={S} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  minimum: (
    <svg viewBox="0 0 26 26" width="100%" height="100%" aria-hidden="true">
      <circle cx="13" cy="13" r="5.6" fill={S} />
      <path d="M10.8 13.2l1.6 1.6 3.2-3.4" fill="none" stroke="var(--color-leaf)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  partial: (
    <svg viewBox="0 0 26 26" width="100%" height="100%" aria-hidden="true">
      <path d="M13 3.4a9.6 9.6 0 0 0 0 19.2z" fill={S} opacity="0.3" />
      <circle cx="13" cy="13" r="9.6" fill="none" stroke={S} strokeWidth="2.1" />
    </svg>
  ),
  missed: (
    <svg viewBox="0 0 26 26" width="100%" height="100%" aria-hidden="true">
      <circle cx="13" cy="13" r="9.6" fill="none" stroke={S} strokeWidth="1.7" opacity="0.75" />
    </svg>
  ),
  exception: (
    <svg viewBox="0 0 26 26" width="100%" height="100%" aria-hidden="true">
      <circle cx="13" cy="13" r="9.6" fill="none" stroke={S} strokeWidth="1.7" opacity="0.8" />
      <path d="M6.8 19.2L19.2 6.8" stroke={S} strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  ),
  paused: (
    <svg viewBox="0 0 26 26" width="100%" height="100%" aria-hidden="true">
      <path d="M10.2 7.4v11.2M15.8 7.4v11.2" stroke={S} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  ),
  unscheduled: (
    <svg viewBox="0 0 26 26" width="100%" height="100%" aria-hidden="true">
      <path d="M8.5 13h9" stroke={S} strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
    </svg>
  ),
  future: (
    <svg viewBox="0 0 26 26" width="100%" height="100%" aria-hidden="true">
      <circle cx="13" cy="13" r="9.6" fill="none" stroke={S} strokeWidth="1.3" opacity="0.4" />
    </svg>
  ),
};
