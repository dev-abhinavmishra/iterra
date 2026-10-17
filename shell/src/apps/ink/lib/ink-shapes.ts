/* ink-shapes.ts — deterministic path math for the ink-art components.
 * Kept apart from ink.tsx so fast refresh stays happy.
 */

/** Deterministic 0..1 hash — same seed, same mark. */
export const hashOf = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
};

/** Seeded PRNG stream. */
export const rng = (seed: string) => {
  let a = Math.floor(hashOf(seed) * 4294967295) || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pt = (a: number, r: number): [number, number] => [Math.cos(a) * r, Math.sin(a) * r];

/** Catmull-Rom → cubic bezier closed path through pts. */
export const smoothClosed = (pts: [number, number][]): string => {
  const n = pts.length;
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += ` C ${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)}, ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return `${d} Z`;
};

/**
 * An organic ink blot — a lumpy blob with wobble harmonics so no two
 * notes share the same stain. Centered at 0,0, nominal radius r.
 */
export const blotPath = (seed: string, r: number): string => {
  const rand = rng(seed);
  const n = 18;
  const wobA = 0.05 + rand() * 0.09;
  const wobF = 2 + Math.floor(rand() * 3);
  const phase = rand() * Math.PI * 2;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rad = r * (0.86 + rand() * 0.28 + Math.sin(a * wobF + phase) * wobA);
    pts.push(pt(a, rad));
  }
  return smoothClosed(pts);
};
