/* ink.tsx — procedural ink-art for the desk.
 * A blot is drawn once per seed and stays that way forever, like a real stain.
 * Everything is SVG, deterministic, and cheap. Path math lives in ink-shapes.ts.
 */
import React, { useMemo } from 'react';
import { blotPath, rng, smoothClosed } from './ink-shapes';

/* The pen cup lives in pens.ts (non-component exports break fast refresh). */

/* ── InkBlot — a note's fingerprint ─────────────────────────── */

interface InkBlotProps {
  seed: string;
  size?: number;
  className?: string;
  color?: string;
  opacity?: number;
  /** satellite flecks flung off the nib */
  satellites?: number;
}

export const InkBlot: React.FC<InkBlotProps> = ({ seed, size = 20, className, color = 'var(--color-ink)', opacity = 0.8, satellites = 2 }) => {
  const { d, flecks } = useMemo(() => {
    const rand = rng(`${seed}:flecks`);
    const flecks = Array.from({ length: satellites }, () => {
      const a = rand() * Math.PI * 2;
      const dist = 42 + rand() * 14;
      return { x: Math.cos(a) * dist, y: Math.sin(a) * dist, r: 1.4 + rand() * 2.4 };
    });
    return { d: blotPath(seed, 34), flecks };
  }, [seed, satellites]);

  return (
    <svg width={size} height={size} viewBox="-64 -64 128 128" className={className} aria-hidden>
      <path d={d} fill={color} opacity={opacity} />
      {flecks.map((f, i) => (
        <circle key={i} cx={f.x} cy={f.y} r={f.r} fill={color} opacity={opacity * 0.55} />
      ))}
    </svg>
  );
};

/* ── PenNib — the Write button's own icon, drawn as a nib ───── */

export const PenNib: React.FC<{ className?: string; strokeWidth?: number }> = ({ className, strokeWidth = 1.75 }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    {/* nib body — pointed down-left like a held pen */}
    <path d="M4.5 19.5 C5.5 13 9.5 6 19.8 3.8 C19 13.5 12.5 18 4.5 19.5 Z" />
    {/* slit + breather hole */}
    <path d="M4.5 19.5 L12.8 11.2" />
    <circle cx="14.6" cy="9.4" r="1.35" fill="currentColor" stroke="none" />
  </svg>
);

/* ── Squiggle — a hand-drawn rule. draws itself once on mount ── */

interface SquiggleProps {
  seed: string;
  color?: string;
  width?: number;
  strokeWidth?: number;
  className?: string;
  draw?: boolean;
}

export const Squiggle: React.FC<SquiggleProps> = ({ seed, color = 'var(--color-pencil)', width = 120, strokeWidth = 1.4, className, draw = false }) => {
  const d = useMemo(() => {
    const rand = rng(seed);
    const y = 4;
    let p = `M 0 ${y}`;
    const steps = Math.max(4, Math.round(width / 34));
    for (let i = 1; i <= steps; i++) {
      const x = (i / steps) * width;
      const px = x - (width / steps) * 0.5;
      const lift = (rand() - 0.5) * 3.4;
      p += ` Q ${px.toFixed(1)} ${(y + lift).toFixed(1)} ${x.toFixed(1)} ${(y + (rand() - 0.5) * 1.6).toFixed(1)}`;
    }
    return p;
  }, [seed, width]);

  return (
    <svg width={width} height="8" viewBox={`0 0 ${width} 8`} className={className} aria-hidden preserveAspectRatio="none">
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        pathLength={1}
        className={draw ? 'ink-draw' : undefined}
      />
    </svg>
  );
};

/* ── Strike — a proofreader's rough cross-out stroke ────────── */

export const Strike: React.FC<{ seed: string; width?: number; stretch?: boolean; color?: string; className?: string }> = ({ seed, width = 100, stretch = false, color = 'var(--color-pencil)', className }) => {
  const d = useMemo(() => {
    const rand = rng(`${seed}:strike`);
    let p = 'M 0 5';
    const steps = Math.max(3, Math.round(width / 26));
    for (let i = 1; i <= steps; i++) {
      p += ` L ${((i / steps) * width).toFixed(1)} ${(4 + (rand() - 0.5) * 4.5).toFixed(1)}`;
    }
    return p;
  }, [seed, width]);

  return (
    <svg
      width={stretch ? '100%' : width}
      height="10"
      viewBox={`0 0 ${width} 10`}
      className={className}
      aria-hidden
      preserveAspectRatio="none"
    >
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" opacity={0.85} vectorEffect="non-scaling-stroke" />
      {/* second lighter pass — real cross-outs go twice */}
      <path d={d} fill="none" stroke={color} strokeWidth={0.9} strokeLinecap="round" opacity={0.4} transform="translate(0 1.5)" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

/* ── ProofCircle — a red-pencil circle, drawn around a thing ── */

export const ProofCircle: React.FC<{ seed: string; width?: number; height?: number; stretch?: boolean; className?: string }> = ({ seed, width = 100, height = 40, stretch = false, className }) => {
  const d = useMemo(() => {
    const rand = rng(`${seed}:circle`);
    const cx = width / 2, cy = height / 2;
    const rx = width / 2 - 1, ry = height / 2 - 1;
    const pts: [number, number][] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const w = 1 + (rand() - 0.5) * 0.14;
      pts.push([cx + Math.cos(a) * rx * w, cy + Math.sin(a) * ry * w]);
    }
    return smoothClosed(pts);
  }, [seed, width, height]);

  return (
    <svg
      width={stretch ? '100%' : width + 6}
      height={stretch ? '100%' : height + 6}
      viewBox={stretch ? `0 0 ${width} ${height}` : `-3 -3 ${width + 6} ${height + 6}`}
      className={className}
      aria-hidden
      preserveAspectRatio={stretch ? 'none' : 'xMidYMid meet'}
    >
      <path d={d} fill="none" stroke="var(--color-pencil)" strokeWidth={1.5} strokeLinecap="round" pathLength={1} className="ink-draw" opacity={0.85} vectorEffect={stretch ? 'non-scaling-stroke' : undefined} />
    </svg>
  );
};

/* ── TornEdge — the deckle top of a sheet pulled from the pad ── */

export const TornEdge: React.FC<{ seed?: string; className?: string }> = ({ seed = 'sheet', className }) => {
  const d = useMemo(() => {
    const rand = rng(`torn:${seed}`);
    const w = 1200, h = 14;
    let p = `M 0 ${h} L 0 ${(5 + rand() * 4).toFixed(1)}`;
    for (let x = 18; x <= w; x += 18) {
      p += ` L ${x} ${(2.5 + rand() * 8).toFixed(1)}`;
    }
    return `${p} L ${w} ${h} Z`;
  }, [seed]);

  return (
    <svg viewBox="0 0 1200 14" preserveAspectRatio="none" className={className} aria-hidden>
      <path d={d} fill="var(--color-paper)" />
      <path d={d} fill="none" stroke="var(--color-line-strong)" strokeWidth="0.8" opacity={0.7} />
    </svg>
  );
};

/* ── InkDrop — a drop falls and lands on a fresh page ───────── */

export const InkDrop: React.FC<{ seed?: string; size?: number; color?: string }> = ({ seed = 'drop', size = 34, color = 'var(--color-ink)' }) => (
  <span className="ink-drop-wrap" aria-hidden>
    <svg width={size} height={size} viewBox="-64 -64 128 128" className="ink-drop-land">
      <path d={blotPath(seed, 36)} fill={color} opacity={0.85} />
    </svg>
  </span>
);

/* ── InkWell — the desk's ink bottle; fill = pages wet today ── */

export const InkWell: React.FC<{ level: number; className?: string; /** changes every time a drop lands — replays the splash */
  pulse?: number }> = ({ level, className, pulse = 0 }) => {
  const pct = Math.max(0.06, Math.min(1, level));
  const clipId = React.useId();
  return (
    <svg viewBox="0 0 40 46" className={className} aria-hidden>
      <defs>
        <clipPath id={clipId}>
          {/* bottle interior: neck at top, shouldered body */}
          <path d="M15 6 h10 v5 c6 2 9 7 9 14 v14 a4 4 0 0 1 -4 4 h-20 a4 4 0 0 1 -4 -4 v-14 c0 -7 3 -12 9 -14 Z" />
        </clipPath>
      </defs>
      {/* ink inside the bottle — bobs when a fresh drop lands */}
      <g clipPath={`url(#${clipId})`} className={pulse ? 'well-bob' : undefined} key={pulse ? `b${pulse}` : 'b'}>
        <rect x="0" y={46 - pct * 40} width="40" height="46" fill="var(--color-ink)" opacity={0.85} style={{ transition: 'y .7s var(--ease-out)' }} />
        {/* meniscus glint */}
        <ellipse cx="20" cy={46 - pct * 40} rx="13" ry="1.6" fill="var(--color-paper)" opacity={0.18} style={{ transition: 'cy .7s var(--ease-out)' }} />
      </g>
      {/* the drop itself, falling from the lip to the surface */}
      {pulse > 0 && (
        <circle key={`d${pulse}`} className="well-drop" cx="20" cy={46 - pct * 40} r="2.6" fill="var(--color-ink)" />
      )}
      {/* glass outline */}
      <path d="M15 6 h10 v5 c6 2 9 7 9 14 v14 a4 4 0 0 1 -4 4 h-20 a4 4 0 0 1 -4 -4 v-14 c0 -7 3 -12 9 -14 Z"
        fill="none" stroke="var(--color-ink-faint)" strokeWidth="1.3" />
      {/* the lip where the pen dips */}
      <rect x="13" y="2.5" width="14" height="4.5" rx="1.5" fill="var(--color-ink-faint)" />
    </svg>
  );
};

/* ── Spatter — the flecks a full nib throws off ─────────────── */

export const Spatter: React.FC<{ seed: string; size?: number; className?: string; color?: string; opacity?: number }> = ({ seed, size = 80, className, color = 'var(--color-ink)', opacity = 0.5 }) => {
  const dots = useMemo(() => {
    const rand = rng(`${seed}:spatter`);
    return Array.from({ length: 9 }, () => ({
      x: rand() * 100,
      y: rand() * 100,
      r: 0.6 + rand() * 1.8,
      o: 0.25 + rand() * 0.75,
    }));
  }, [seed]);

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={color} opacity={d.o * opacity} />
      ))}
    </svg>
  );
};

/* ── PenRest — the empty-state illustration, a nib at rest ──── */

export const PenRest: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 120 60" className={className} aria-hidden fill="none" strokeLinecap="round">
    {/* a fountain pen lying on the desk, nib left */}
    <g stroke="var(--color-ink-faint)" strokeWidth="1.6">
      <path d="M22 30 C30 26 40 24 52 24 L96 24" />
      <path d="M22 30 C30 34 40 36 52 36 L96 36" />
      <path d="M96 24 L104 24 A6 6 0 0 1 104 36 L96 36" />
      {/* nib */}
      <path d="M22 30 L34 25.5 M22 30 L34 34.5" />
      <path d="M30 30 L22 30" />
      {/* slit */}
      <path d="M28 30 L34 30" strokeWidth="1" />
    </g>
    <circle cx="30.5" cy="30" r="1.2" fill="var(--color-ink-faint)" stroke="none" />
    {/* the ink it's waiting beside */}
    <path d={blotPath('resting-pen', 7)} fill="var(--color-ink)" opacity={0.5} transform="translate(16 46)" />
  </svg>
);
