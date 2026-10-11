import React, { useRef, useCallback, useEffect } from 'react';
import { flapTick, unlockAudio } from '../lib/sound';
import { vibrate } from '../lib/utils';

/* A kitchen-timer knob: drag around the dial to set minutes.
   Detent every minute (click + haptic), heavier notch every five. */
export function RotaryDial({
  minutes, onChange, size = 300, max = 60, disabled = false, children,
}: {
  minutes: number;
  onChange: (m: number) => void;
  size?: number;
  max?: number;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const lastMinute = useRef(minutes);

  /* keep the detent cache in step when minutes change from outside
     (quick chips, presets) so dragging back to them still fires */
  useEffect(() => { lastMinute.current = minutes; }, [minutes]);

  const angleFor = (m: number) => (m / max) * 360;

  const setFromPointer = useCallback((e: React.PointerEvent | PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    let deg = Math.atan2(dx, -dy) * (180 / Math.PI); // 0 = top
    if (deg < 0) deg += 360;
    let m = Math.round((deg / 360) * max);
    if (m < 1) m = deg > 352 ? max : 1;
    if (m > max) m = max;
    if (m !== lastMinute.current) {
      lastMinute.current = m;
      flapTick(0.05);
      vibrate(4);
      onChange(m);
    }
  }, [max, onChange]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    unlockAudio();
    dragging.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setFromPointer(e);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || disabled) return;
    setFromPointer(e);
  };
  const stop = () => { dragging.current = false; };

  const cx = 150, cy = 150, R = 138;
  const ticks = Array.from({ length: max }, (_, i) => {
    const a = (i / max) * Math.PI * 2;
    const major = i % 5 === 0;
    const r1 = major ? R - 14 : R - 7;
    return {
      x1: cx + r1 * Math.sin(a), y1: cy - r1 * Math.cos(a),
      x2: cx + R * Math.sin(a), y2: cy - R * Math.cos(a),
      major,
    };
  });
  const frac = Math.min(1, minutes / max);
  const arcR = R - 26;
  const arcLen = 2 * Math.PI * arcR;
  const a = frac * Math.PI * 2;
  const hx = cx + arcR * Math.sin(a);
  const hy = cy - arcR * Math.cos(a);

  return (
    <div
      ref={ref}
      className="relative select-none"
      style={{ width: size, height: size, touchAction: 'none', cursor: disabled ? 'default' : 'grab' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      role="slider"
      aria-label="Set minutes"
      aria-valuemin={1}
      aria-valuemax={max}
      aria-valuenow={minutes}
    >
      <svg viewBox="0 0 300 300" className="absolute inset-0 w-full h-full">
        {/* outer bezel */}
        <circle cx={cx} cy={cy} r={R + 8} fill="none" stroke="rgb(var(--ink-rgb) / 0.35)" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgb(var(--ink-rgb) / 0.25)" strokeWidth="1" />
        {ticks.map((t, i) => (
          <line
            key={i}
            x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
            stroke={i <= minutes ? 'var(--color-signal)' : 'rgb(var(--ink-rgb) / 0.45)'}
            strokeWidth={t.major ? 2.4 : 1.2}
            strokeLinecap="round"
            opacity={i <= minutes ? 0.9 : 0.5}
            style={{ transition: 'stroke 0.25s ease, opacity 0.25s ease' }}
          />
        ))}
        {/* progress arc — chases smoothly when the value jumps (chips, presets) */}
        <circle
          cx={cx} cy={cy} r={arcR} fill="none"
          stroke="var(--color-signal)" strokeWidth="7" strokeLinecap="round"
          strokeDasharray={arcLen}
          strokeDashoffset={arcLen * (1 - frac)}
          transform={`rotate(-90 ${cx} ${cy})`}
          opacity={0.9}
          style={{
            filter: 'drop-shadow(0 0 6px rgba(232,73,15,0.45))',
            transition: 'stroke-dashoffset 0.3s cubic-bezier(0.3, 0.9, 0.3, 1)',
          }}
        />
        {/* track under arc */}
        <circle cx={cx} cy={cy} r={arcR} fill="none" stroke="rgb(var(--ink-rgb) / 0.14)" strokeWidth="7" style={{ mixBlendMode: 'var(--dial-blend, multiply)' as React.CSSProperties['mixBlendMode'] }} />
        {/* handle — CSS transform so it glides to jumps instead of teleporting */}
        {minutes > 0 && (
          <g style={{ transform: `translate(${hx}px, ${hy}px)`, transition: 'transform 0.3s cubic-bezier(0.3, 0.9, 0.3, 1)' }}>
            <circle r="11" fill="var(--color-signal)" stroke="#FFEDE3" strokeWidth="2"
              style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }} />
            <line x1="0" y1="0" x2="0" y2="-7" stroke="#FFEDE3" strokeWidth="2.4" strokeLinecap="round" />
          </g>
        )}
      </svg>
      {/* engraved minute numerals on the bezel */}
      {[0, 15, 30, 45].map(v => {
        const va = (v / max) * Math.PI * 2;
        const nr = R - 34;
        return (
          <span
            key={v}
            className="absolute font-label font-semibold text-[11px]"
            style={{
              left: `${50 + Math.sin(va) * ((size / 300) * nr / size * 100)}%`,
              top: `${50 - Math.cos(va) * ((size / 300) * nr / size * 100)}%`,
              transform: 'translate(-50%, -50%)',
              color: 'var(--color-ink-soft)',
            }}
          >
            {v === 0 ? '60' : v}
          </span>
        );
      })}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {children}
      </div>
    </div>
  );
}
