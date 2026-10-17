// ── The pad — a step on the sequencer ────────────────────────────────────────
// State lives in the SHAPE, not the color — the pattern must read at a glance
// in grayscale and to a screen reader.
//
//   full        ■ lit pad (the hit landed — LED glow)
//   minimum     ▪ smaller lit pad — a real hit at the smaller bar
//   partial     ◧ pad half-lit
//   missed      □ hollow pad with a rest — programmed, didn't sound
//   exception   ⊠ muted pad — day taken out of the pattern, not erased
//   paused      ‖ hold bars — channel parked
//   unscheduled – an empty slot
//   future      · an unprogrammed slot

import type { DayState } from '../lib/register';
import { cx } from '../lib/utils';

export function Pad({
  state,
  accent,
  size = 26,
  hit = false,
  title,
}: {
  state: DayState;
  accent?: string; // 'indigo' etc — the channel's LED color
  size?: number;
  hit?: boolean; // play the pad-hit once — the trigger landing
  title?: string;
}) {
  const glyph = GLYPHS[state];
  return (
    <span
      className={cx('pad', `pad--${state}`, accent && `acc-${accent}`, hit && 'pad--hit')}
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
      <rect x="3.5" y="3.5" width="19" height="19" rx="4.5" fill={S} />
      <rect x="6.5" y="6" width="13" height="5" rx="2" fill="#ffffff" opacity="0.25" />
    </svg>
  ),
  minimum: (
    <svg viewBox="0 0 26 26" width="100%" height="100%" aria-hidden="true">
      <rect x="8" y="8" width="10" height="10" rx="3" fill={S} />
      <rect x="10" y="9.5" width="6" height="2.6" rx="1" fill="#ffffff" opacity="0.3" />
    </svg>
  ),
  partial: (
    <svg viewBox="0 0 26 26" width="100%" height="100%" aria-hidden="true">
      <rect x="3.5" y="3.5" width="19" height="19" rx="4.5" fill="none" stroke={S} strokeWidth="1.6" />
      <rect x="4.5" y="4.5" width="9.5" height="17" rx="2.5" fill={S} opacity="0.85" />
    </svg>
  ),
  missed: (
    <svg viewBox="0 0 26 26" width="100%" height="100%" aria-hidden="true">
      <rect x="3.5" y="3.5" width="19" height="19" rx="4.5" fill="none" stroke={S} strokeWidth="1.5" opacity="0.6" />
      <path d="M10.5 13h5" stroke={S} strokeWidth="1.7" strokeLinecap="round" opacity="0.8" />
    </svg>
  ),
  exception: (
    <svg viewBox="0 0 26 26" width="100%" height="100%" aria-hidden="true">
      <rect x="3.5" y="3.5" width="19" height="19" rx="4.5" fill="none" stroke={S} strokeWidth="1.5" opacity="0.75" />
      <path d="M7.5 18.5L18.5 7.5" stroke={S} strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  ),
  paused: (
    <svg viewBox="0 0 26 26" width="100%" height="100%" aria-hidden="true">
      <rect x="3.5" y="3.5" width="19" height="19" rx="4.5" fill="none" stroke={S} strokeWidth="1.2" opacity="0.4" />
      <path d="M10.3 8v10M15.7 8v10" stroke={S} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  ),
  unscheduled: (
    <svg viewBox="0 0 26 26" width="100%" height="100%" aria-hidden="true">
      <path d="M8 13h10" stroke={S} strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
    </svg>
  ),
  future: (
    <svg viewBox="0 0 26 26" width="100%" height="100%" aria-hidden="true">
      <rect x="3.5" y="3.5" width="19" height="19" rx="4.5" fill="none" stroke={S} strokeWidth="1.1" opacity="0.35" />
    </svg>
  ),
};
