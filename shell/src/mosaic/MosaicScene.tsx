/* MosaicScene — an animated pixel mosaic: a beach-at-dusk scene painted
   into an ImageData buffer where every "tile" is one canvas pixel, scaled
   up by CSS (image-rendering: pixelated). Rendered at 320×180 so tiles
   stay fine-grained even on large displays.

   Layers move continuously — drifting clouds, a breathing sun with
   turning rays, an occasional shooting star, travelling wave bands and
   crests, a bobbing sailboat, wheeling birds, swaying palm crowns,
   beach umbrella — and every cell carries a slow colour shimmer.
   Palette leans on deep jungle greens over the sunbleached teals.
   Honours prefers-reduced-motion (single frame) and pauses offscreen.

   Perf notes: the pixel loop works on raw r/g/b numbers (no per-pixel
   array allocation), the shimmer is two table lookups instead of three
   sin() calls per pixel, wave heights are hoisted per column, and the
   expensive sun/star/cloud math is bbox-rejected. */
import { useEffect, useRef } from 'react';

const COLS = 320;
const ROWS = 180;

const HORIZON = 68; // sky | sea boundary
const SEA_BOT = 100; // sea | sand boundary

const C = {
  skyTop: [88, 178, 212],
  skyMid: [158, 214, 204],
  horizon: [254, 242, 216],
  sunCore: [255, 226, 150],
  sunEdge: [240, 172, 82],
  cloud: [255, 253, 246],
  cloudShade: [226, 214, 188],
  headland: [74, 122, 134],
  seaShallow: [118, 202, 198],
  seaMid: [50, 148, 164],
  seaDeep: [18, 100, 132],
  crest: [232, 255, 250],
  foam: [255, 253, 246],
  sailHull: [92, 58, 38],
  sail: [255, 250, 236],
  sailShade: [226, 214, 188],
  sandTop: [246, 224, 180],
  sandLow: [228, 198, 148],
  speck: [204, 168, 110],
  shell: [240, 186, 158],
  trunk: [128, 80, 46],
  trunkDark: [90, 56, 32],
  frondDeep: [40, 88, 50],
  frondMid: [64, 118, 62],
  frondLight: [104, 152, 74],
  frondTip: [136, 176, 86],
  nut: [62, 42, 26],
  star: [200, 94, 50],
  ball: [196, 86, 68],
  ball2: [252, 239, 214],
  ball3: [255, 222, 142],
  bird: [48, 68, 76],
  grass: [52, 104, 56],
  fish: [36, 88, 100],
  fishDark: [22, 56, 66],
  firefly: [255, 234, 146],
  kite: [222, 106, 72],
} as const;

/* sprite map cell codes → colours. 1-8 palms (trunk/fronds/nut/grass),
   9-16 scene actors (kite, tail, fish, wake, fireflies). Everything that
   moves independently of the pixel grid is rasterized into this map once
   per frame, so the pixel loop stays one lookup per pixel. */
const SPRITE_COLORS: RGB[] = [
  C.trunk, C.trunkDark, C.frondDeep, C.frondMid, C.frondLight, C.frondTip, C.nut, C.grass,
  C.kite, C.cloud, C.fish, C.fishDark, [240, 248, 246], C.firefly, [255, 244, 200], [228, 240, 234],
];

type RGB = readonly [number, number, number];

const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/* blend channel v toward palette entry c[idx] by t — the pixel loop's
   only colour operation; writes into a reused scratch triple */
const M = [0, 0, 0];
const blend = (v0: number, v1: number, v2: number, c: RGB, t: number) => {
  M[0] = lerp(v0, c[0], t);
  M[1] = lerp(v1, c[1], t);
  M[2] = lerp(v2, c[2], t);
  return M;
};

/* cheap integer hash — Math.sin hashing per pixel was the hot spot at
   320×180, so speckle/sparkle/trunk texture use this instead */
const ihash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

/* scene anchors */
const SUN = { x: 238, y: 30, r: 12 };
const SUN_GLOW_R = SUN.r + 10 + 1; // max radius incl. pulse
const CLOUDS = [
  { x: 34, y: 16, w: 38, h: 10, sp: 2.0 },
  { x: 128, y: 10, w: 26, h: 8, sp: 2.8 },
  { x: 196, y: 42, w: 24, h: 8, sp: 1.4 },
  { x: 286, y: 62, w: 18, h: 6, sp: 3.6 },
];
const PALMS = [
  { x: 46, base: 172, h: 62, lean: 14, ph: 0.0 },
  { x: 102, base: 176, h: 48, lean: -10, ph: 2.1 },
  { x: 160, base: 170, h: 58, lean: 12, ph: 4.2 },
  { x: 236, base: 174, h: 54, lean: -16, ph: 1.2 },
  { x: 294, base: 172, h: 58, lean: -12, ph: 3.3 },
];
const BOAT = { x: 198, y: 86 }; // sits on the waterline
const HEADLAND = { x0: 4, x1: 42, top: 56 }; // distant island silhouette, left horizon
const STAR = { x: 214, y: 166 };
const BALL = { x: 138, y: 168, r: 8 };
const UMB = { x: 262, top: 124, base: 162 }; // beach umbrella
const UMB_LEFT = UMB.x - 26, UMB_RIGHT = UMB.x + 26;
/* fish leaping out of the sea on a slow cycle — arc from x0 to x1 */
const FISH = { x0: 92, x1: 138, period: 6.4, dur: 0.85, apex: 14 };
/* fireflies wandering the sand after dusk */
const FLIES = [
  { x: 58, y: 148, p: 0.0 },
  { x: 148, y: 158, p: 2.1 },
  { x: 232, y: 152, p: 4.0 },
  { x: 282, y: 142, p: 1.2 },
  { x: 108, y: 170, p: 5.3 },
];

/* shooting star cycle — ~11s period, 0.7s streak */
function shootingStar(t: number) {
  const p = t % 11;
  if (p > 0.7) return null;
  const k = p / 0.7;
  return { x0: 292 - k * 120, y0: 14 + k * 34, dx: -120 / 0.7, dy: 34 / 0.7 };
}

function waveYArr(t: number): Float32Array {
  const arr = new Float32Array(COLS);
  for (let x = 0; x < COLS; x++) {
    arr[x] = HORIZON + 2.8 + Math.sin(x * 0.08 + t * 1.6) * 3.2 + Math.sin(x * 0.028 - t * 0.75) * 2.4;
  }
  return arr;
}

/* per-row gradient factors — dpt/pow are constant down a column, so they
   are computed once per row instead of once per pixel */
const ROW = {
  seaK: new Float32Array(ROWS),
  sandK: new Float32Array(ROWS),
  skyT: new Float32Array(ROWS),
};
for (let y = 0; y < ROWS; y++) {
  ROW.seaK[y] = Math.pow((y - HORIZON) / (SEA_BOT - HORIZON), 0.8);
  ROW.sandK[y] = (y - SEA_BOT) / (ROWS - SEA_BOT);
  ROW.skyT[y] = y / HORIZON;
}

/* shimmer lookup tables — two diagonal waves replace 3 sin() calls per
   pixel; rebuilt once per frame (≈1.5k sins instead of ≈170k) */
const SHIM_A = new Float32Array(512);
const SHIM_B = new Float32Array(1024);
function shimmerTables(t: number) {
  for (let i = 0; i < 512; i++) SHIM_A[i] = Math.sin(t * 0.9 + i * 0.1963);
  for (let i = 0; i < 1024; i++) SHIM_B[i] = Math.sin(t * 2.3 + i * 0.0982);
}

/* rasterize every independent sprite once per frame into a cell→colour-code
   map so the pixel loop stays a single lookup instead of per-pixel math.
   Covers palms, the kite, the leaping fish, boat wake and fireflies. */
let spriteBuf = new Uint8Array(0);
function buildSpriteMap(t: number, waves: Float32Array, boatBy: number): Uint8Array {
  const map = spriteBuf.length === COLS * ROWS ? spriteBuf : (spriteBuf = new Uint8Array(COLS * ROWS));
  map.fill(0);
  const put = (x: number, y: number, code: number) => {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi >= 0 && xi < COLS && yi >= 0 && yi < ROWS) map[yi * COLS + xi] = code;
  };
  /* palms — trunks, crowns, spears, coconuts, grass tufts */
  for (const p of PALMS) {
    const sway = Math.sin(t * 0.9 + p.ph) * 1.4;
    for (let s = 0; s <= p.h; s++) {
      const k = s / p.h;
      const tx = p.x + p.lean * k + sway * k;
      const ty = p.base - s;
      put(tx, ty, ihash(Math.round(tx), Math.round(ty)) > 0.22 ? 1 : 2);
      put(tx + 1, ty, 2);
      if (s <= 16) put(tx - 1, ty, 2); // thicker trunk foot
    }
    const cx0 = p.x + p.lean + sway;
    const cy0 = p.base - p.h;
    /* coconuts cluster under the crown */
    put(cx0 - 2, cy0 + 2, 7);
    put(cx0 + 2, cy0 + 2, 7);
    put(cx0 - 1, cy0 + 4, 7);
    put(cx0 + 2, cy0 + 4, 7);
    /* fronds — 9 arcs reaching up-and-out, tips swaying then drooping */
    for (let f = 0; f < 9; f++) {
      const ang = Math.PI + (f / 8) * Math.PI; // π→2π → sin≤0 reaches skyward
      const len = 22 + ((f * 7 + Math.round(p.ph * 10)) % 12);
      for (let s2 = 0; s2 <= len; s2++) {
        const k = s2 / len;
        const swayTip = Math.sin(t * 1.5 + p.ph + f * 0.7 + s2 * 0.3) * k * 5.0;
        const lift = Math.sin(k * Math.PI) * 6.5; // arcs up mid-span
        const droop = k * k * 8.5; // tips fall
        const fx = cx0 + Math.cos(ang) * s2 * 1.15 + swayTip;
        const fy = cy0 - lift * 0.9 + droop - Math.abs(Math.sin(ang)) * s2 * 0.12;
        const code = 3 + ((f * 2 + s2) % 4); // deep → mid → light → tip
        put(fx, fy, code);
        if (s2 < len * 0.45) put(fx, fy + 1, code); // thick near crown
      }
    }
    /* inner upright spears for a fuller crown */
    for (let f = 0; f < 5; f++) {
      const off = (f - 2) * 3.4;
      for (let s2 = 0; s2 <= 13; s2++) {
        const swayTip = Math.sin(t * 1.8 + p.ph + f) * (s2 / 13) * 2.6;
        put(cx0 + off + swayTip, cy0 - s2, 3 + (f % 4));
      }
    }
    /* grass tufts around the base — keeps the green down on the sand */
    for (let k = 0; k < 7; k++) {
      const gx = p.x + ((k * 37 + Math.round(p.ph * 10)) % 26) - 13;
      const gy = p.base + 3 + ((k * 13) % 6);
      put(gx, gy, 8);
      put(gx, gy - 1 - (k % 2), 8);
    }
  }
  /* kite — diamond + dotted tail crossing the sky */
  const kiteX = ((t * 5.2) % (COLS + 48)) - 24;
  const kiteY = 24 + Math.sin(t * 0.6) * 5 + Math.sin(kiteX * 0.04) * 5;
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      if (Math.abs(dx) + Math.abs(dy) * 1.7 <= 3.2) put(kiteX + dx, kiteY + dy, 9);
    }
  }
  for (let ti = 0; ti < 6; ti++) {
    put(kiteX - 3 - ti * 2, kiteY + 4 + ti * 3 + Math.sin(t * 2 + ti) * 1.5, 10);
  }
  /* leaping fish — ellipse body + forked tail, splash at takeoff/landing */
  const fp = t % FISH.period;
  if (fp < FISH.dur) {
    const fk = fp / FISH.dur;
    const fishX = FISH.x0 + (FISH.x1 - FISH.x0) * fk;
    const fishBase = waves[Math.min(COLS - 1, Math.max(0, Math.round(fishX)))] ?? HORIZON + 3;
    const fishY = fishBase - 1 - Math.sin(fk * Math.PI) * FISH.apex;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -6; dx <= 5; dx++) {
        const fdx = (dx - 1) / 3.2, fdy = dy / 1.5;
        if (fdx * fdx + fdy * fdy <= 1) put(fishX + dx, fishY + dy, 11);
        else if (dx <= -2 && dx >= -5 && Math.abs(dy) <= (-dx - 1) * 0.8) put(fishX + dx, fishY + dy, 12);
      }
    }
    if (fk < 0.12 || fk > 0.88) {
      for (let sx = -3; sx <= 3; sx++) put(fishX + sx, fishBase + (sx % 2), 13);
    }
  }
  /* boat wake — foam ticks trailing the hull */
  for (let wx = BOAT.x - 18; wx < BOAT.x - 6; wx++) {
    if (Math.sin(wx * 0.9 + t * 3) > 0.55) {
      put(wx, boatBy, 16);
      if (ihash(wx, Math.round(boatBy)) > 0.6) put(wx, boatBy + 1, 16);
    }
  }
  /* fireflies — bright core + soft glow ring, only while lit */
  for (const f of FLIES) {
    const fi = Math.max(0, Math.sin(t * 2.2 + f.p * 3)) ** 2;
    if (fi < 0.04) continue;
    const fx = f.x + Math.sin(t * 0.5 + f.p) * 6;
    const fy = f.y + Math.sin(t * 0.8 + f.p * 1.7) * 4;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 < 1.2) put(fx + dx, fy + dy, 14);
        else if (d2 < 9 && fi > 0.15) put(fx + dx, fy + dy, 15);
      }
    }
  }
  return map;
}

function paintFrame(data: Uint8ClampedArray, t: number) {
  const waves = waveYArr(t);
  const star = shootingStar(t);
  shimmerTables(t);
  const starLen2 = star ? star.dx * star.dx + star.dy * star.dy : 0;
  const sunGlow2 = SUN_GLOW_R * SUN_GLOW_R;
  const sunRayIn2 = (SUN.r + 5) * (SUN.r + 5);
  const sunRayOut2 = (SUN.r + 10) * (SUN.r + 10);
  const pulse = Math.sin(t * 0.8) * 0.9;
  const glowR = SUN.r + 10 + pulse;
  const discR = SUN.r + pulse;
  /* per-row phase for the sea's drifting bands */
  const rowPhase = new Float32Array(ROWS);
  for (let y = 0; y < ROWS; y++) rowPhase[y] = y * 1.9 + t * 0.7;
  /* precompute cloud screen x once per frame */
  const cloudX = CLOUDS.map((cl) => ((cl.x + t * cl.sp) % (COLS + 60)) - 30);
  /* precompute bird screen x once per frame */
  const birdX = [0, 1, 2].map((off) => ((t * (9 + off * 4) + off * 120) % (COLS + 48)) - 24);
  const birdY = [0, 1, 2].map((off) => 18 + off * 8 + Math.sin(t * 0.9 + off * 2) * 3.2);
  /* boat bob — sprite map needs it for the wake */
  const boatBy = BOAT.y + Math.round(Math.sin(t * 1.3) * 1.6);
  const sprites = buildSpriteMap(t, waves, boatBy);

  let i = 0;
  for (let y = 0; y < ROWS; y++) {
    const band = y < HORIZON ? 0 : y < SEA_BOT ? 1 : 2;
    const rp = rowPhase[y];
    for (let x = 0; x < COLS; x++, i += 4) {
      let r: number, g: number, b: number;

      if (band === 0) {
        /* ── sky ── */
        const tt = ROW.skyT[y];
        if (tt < 0.5) {
          const k = tt * 2;
          r = lerp(C.skyTop[0], C.skyMid[0], k);
          g = lerp(C.skyTop[1], C.skyMid[1], k);
          b = lerp(C.skyTop[2], C.skyMid[2], k);
        } else {
          const k = (tt - 0.5) * 2;
          r = lerp(C.skyMid[0], C.horizon[0], k);
          g = lerp(C.skyMid[1], C.horizon[1], k);
          b = lerp(C.skyMid[2], C.horizon[2], k);
        }
        /* distant headland on the left horizon */
        if (y >= HEADLAND.top && x >= HEADLAND.x0 && x <= HEADLAND.x1) {
          const hump = 4 + Math.round(Math.sin((x - HEADLAND.x0) * 0.45) * 3);
          if (y >= HORIZON - hump - 1) { r = C.headland[0]; g = C.headland[1]; b = C.headland[2]; }
        }
        /* shooting star — bbox-rejected, bright head + short fading trail */
        if (star && x > 140 && x < 310 && y < 62) {
          const rx = x - star.x0, ry = y - star.y0;
          const along = (rx * star.dx + ry * star.dy) / starLen2;
          if (along >= 0 && along <= 1) {
            const px = star.x0 + star.dx * along, py = star.y0 + star.dy * along;
            const ddx = x - px, ddy = y - py;
            if (ddx * ddx + ddy * ddy < 2.6) {
              const m = blend(r, g, b, C.sunCore, 0.9 - along * 0.5);
              r = m[0]; g = m[1]; b = m[2];
            }
          }
        }
        /* sun — squared-distance rejects keep hypot/atan2 off the hot path */
        const sdx = x - SUN.x, sdy = y - SUN.y;
        const d2 = sdx * sdx + sdy * sdy;
        if (d2 < sunGlow2) {
          const d = Math.sqrt(d2);
          const m = blend(r, g, b, C.sunEdge, (1 - d / glowR) * 0.5);
          r = m[0]; g = m[1]; b = m[2];
          if (d < discR) {
            const m2 = blend(C.sunEdge[0], C.sunEdge[1], C.sunEdge[2], C.sunCore, clamp(d / discR) * 0.4 + 0.3);
            /* blend disc toward core while keeping a hint of edge */
            r = lerp(r, m2[0], 0.85); g = lerp(g, m2[1], 0.85); b = lerp(b, m2[2], 0.85);
          }
          /* rotating ray ticks — only inside the thin ray band */
          if (d2 > sunRayIn2 && d2 < sunRayOut2) {
            const ang = Math.atan2(sdy, sdx);
            const rayPhase = (ang + t * 0.25) % (Math.PI / 4);
            if (Math.abs(rayPhase - Math.PI / 8) < 0.12 && Math.sin(t * 2) > -0.4) {
              const m3 = blend(r, g, b, C.sunEdge, 0.5);
              r = m3[0]; g = m3[1]; b = m3[2];
            }
          }
        }
        for (let ci = 0; ci < CLOUDS.length; ci++) {
          const cl = CLOUDS[ci];
          const cx = cloudX[ci];
          /* bbox reject before the ellipse test */
          if (x < cx - cl.w - 2 || x > cx + cl.w + 2 || y < cl.y - cl.h - 2 || y > cl.y + cl.h + 2) continue;
          const ex = (x - cx) / cl.w, ey = (y - cl.y) / cl.h;
          if (ex * ex + ey * ey <= 1) {
            const m = blend(r, g, b, y > cl.y + cl.h * 0.45 ? C.cloudShade : C.cloud, 0.92);
            r = m[0]; g = m[1]; b = m[2];
          }
        }
        for (let bi = 0; bi < 3; bi++) {
          const bx = birdX[bi], by = birdY[bi];
          if (x < bx - 3 || x > bx + 3 || y < by - 3 || y > by + 3) continue;
          if (Math.abs(x - bx) + Math.abs(y - by) <= 2.6) { r = C.bird[0]; g = C.bird[1]; b = C.bird[2]; }
        }
        /* ── shimmer ── */
        const sh = 1 + 0.04 * SHIM_A[(x + y) & 511] + 0.02 * SHIM_B[(x * 2 - y + 1024) & 1023];
        data[i] = clamp(r * sh, 0, 255);
        data[i + 1] = clamp(g * sh, 0, 255);
        data[i + 2] = clamp(b * sh, 0, 255);
        data[i + 3] = 255;
        continue;
      }

      if (band === 1) {
        /* ── sea ── */
        const dk = ROW.seaK[y];
        r = lerp(C.seaShallow[0], C.seaDeep[0], dk);
        g = lerp(C.seaShallow[1], C.seaDeep[1], dk);
        b = lerp(C.seaShallow[2], C.seaDeep[2], dk);
        /* darker + lighter drifting bands — triangle wave instead of sin
           per pixel; visually identical at this scale */
        let ph = (x * 0.045 + rp) % 6.2831853;
        if (ph < 0) ph += 6.2831853;
        const bandPhase = ph < 3.14159265 ? ph * 0.63661977 - 1 : 3 - ph * 0.63661977;
        if (y < SEA_BOT - 4) {
          if (bandPhase > 0.55) { const m = blend(r, g, b, C.seaDeep, 0.4); r = m[0]; g = m[1]; b = m[2]; }
          else if (bandPhase < -0.65) { const m = blend(r, g, b, C.seaShallow, 0.3); r = m[0]; g = m[1]; b = m[2]; }
        }
        /* travelling crest highlight at the surface line */
        if (y <= waves[x] + 1.0) { const m = blend(r, g, b, C.crest, 0.8); r = m[0]; g = m[1]; b = m[2]; }
        /* sparkle cells */
        if (ihash(x * 3, y * 7) > 0.982 && Math.sin(t * 2.6 + x * 0.45 + y * 1.7) > 0.1) {
          const m = blend(r, g, b, C.crest, 0.85); r = m[0]; g = m[1]; b = m[2];
        }
        /* bobbing sailboat — hull on the waterline, mast + two sails */
        const rel = x - BOAT.x, ry = y - boatBy;
        if (ry === 0 && Math.abs(rel) <= 6) { r = C.sailHull[0]; g = C.sailHull[1]; b = C.sailHull[2]; }
        else if (ry === -2 && Math.abs(rel) <= 4) { r = C.sailHull[0]; g = C.sailHull[1]; b = C.sailHull[2]; }
        else if (rel === 0 && ry <= -2 && ry >= -18) { r = C.sailHull[0]; g = C.sailHull[1]; b = C.sailHull[2]; }
        else if (rel >= -4 && rel <= -1 && ry >= -16 && ry <= -4) { r = C.sail[0]; g = C.sail[1]; b = C.sail[2]; }
        else if (rel >= 1 && rel <= 4 && ry >= -12 && ry <= -4) { r = C.sailShade[0]; g = C.sailShade[1]; b = C.sailShade[2]; }
        else if (ry === -18 && rel === 0) { r = C.sailHull[0]; g = C.sailHull[1]; b = C.sailHull[2]; }
        /* horizon sheen — thin bright line where sea meets sky */
        if (y === HORIZON) { const m = blend(r, g, b, C.crest, 0.35); r = m[0]; g = m[1]; b = m[2]; }
      } else {
        /* ── sand ── */
        const dk2 = ROW.sandK[y];
        r = lerp(C.sandTop[0], C.sandLow[0], dk2);
        g = lerp(C.sandTop[1], C.sandLow[1], dk2);
        b = lerp(C.sandTop[2], C.sandLow[2], dk2);
        const h1 = ihash(x, y);
        if (h1 > 0.93) { const m = blend(r, g, b, C.speck, 0.55); r = m[0]; g = m[1]; b = m[2]; }
        /* wet-sand sheen just above the waterline */
        if (y < SEA_BOT + 6) {
          const m = blend(r, g, b, C.sandTop, (SEA_BOT + 6 - y) / 6 * 0.4);
          r = m[0]; g = m[1]; b = m[2];
        }
        /* animated shoreline foam ticks */
        if (y < SEA_BOT + 4 && Math.sin(x * 0.25 + t * 2.1 + h1 * 3) > 0.72) {
          const m = blend(r, g, b, C.foam, 0.85); r = m[0]; g = m[1]; b = m[2];
        }
        /* starfish — plus-shaped with arms */
        const sdx = Math.abs(x - STAR.x), sdy = Math.abs(y - STAR.y);
        if ((sdx <= 2 && sdy <= 6) || (sdy <= 2 && sdx <= 6)) { r = C.star[0]; g = C.star[1]; b = C.star[2]; }
        /* beach ball — quadrant colours */
        const bdx = x - BALL.x, bdy = y - BALL.y;
        if (bdx * bdx + bdy * bdy <= BALL.r * BALL.r) {
          if (bdx < 0) { if (bdy < 0) { r = C.ball[0]; g = C.ball[1]; b = C.ball[2]; } else { r = C.ball2[0]; g = C.ball2[1]; b = C.ball2[2]; } }
          else if (bdy < 0) { r = C.ball3[0]; g = C.ball3[1]; b = C.ball3[2]; }
          else { r = C.cloud[0]; g = C.cloud[1]; b = C.cloud[2]; }
        }
        /* beach umbrella — striped canopy on a pole */
        if (x >= UMB_LEFT && x <= UMB_RIGHT) {
          const half = 3 + Math.max(0, UMB.top + 14 - y) * 1.7;
          if (y >= UMB.top && y <= UMB.top + 14 && Math.abs(x - UMB.x) <= half) {
            if ((Math.floor((x - UMB.x + half) / 7) + y) % 2 === 0) { r = C.ball[0]; g = C.ball[1]; b = C.ball[2]; }
            else { r = C.cloud[0]; g = C.cloud[1]; b = C.cloud[2]; }
          }
          if ((x === UMB.x || x === UMB.x + 1) && y > UMB.top + 12 && y <= UMB.base) { r = C.trunkDark[0]; g = C.trunkDark[1]; b = C.trunkDark[2]; }
        }
        /* scattered shells */
        if (ihash(x * 7, y * 3) > 0.996 && y > SEA_BOT + 8) { r = C.shell[0]; g = C.shell[1]; b = C.shell[2]; }
      }

      /* ── global colour shimmer — two table lookups per pixel ── */
      const sh = 1 + SHIM_A[(x + y) & 511] * (0.03 + 0.02 * SHIM_A[(x * 5 + y * 3) & 511]);
      data[i] = clamp(r * sh, 0, 255);
      data[i + 1] = clamp(g * sh, 0, 255);
      data[i + 2] = clamp(b * sh, 0, 255);
      data[i + 3] = 255;
    }
  }

  /* sprite pass — palms, kite, fish, wake and fireflies were rasterized
     into the cell map; one lookup per pixel stamps them over the scene */
  for (let p = 0; p < COLS * ROWS; p++) {
    const sp = sprites[p];
    if (!sp) continue;
    const pc = SPRITE_COLORS[sp - 1];
    const j = p * 4;
    data[j] = pc[0];
    data[j + 1] = pc[1];
    data[j + 2] = pc[2];
    data[j + 3] = 255;
  }
}

export function MosaicScene({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(COLS, ROWS);
    const motionQuery =
      typeof window !== 'undefined'
        ? window.matchMedia?.('(prefers-reduced-motion: reduce)')
        : undefined;
    let reduced = motionQuery?.matches ?? false;
    let raf = 0;
    let visible = true;
    const t0 = performance.now();
    const frame = (now: number) => {
      paintFrame(img.data, (now - t0) / 1000);
      ctx.putImageData(img, 0, 0);
      if (!reduced && visible) raf = requestAnimationFrame(frame);
    };
    const kick = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    /* pause the loop while the mosaic is scrolled out of view */
    let io: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver((entries) => {
        visible = entries[0]?.isIntersecting ?? true;
        if (visible && !reduced) kick();
      });
      io.observe(canvas);
    }
    /* the OS setting can flip while the page is open — restart or idle the
       loop instead of animating under reduced-motion until remount */
    const onMotion = () => {
      reduced = motionQuery?.matches ?? false;
      if (!reduced && visible) kick();
    };
    motionQuery?.addEventListener?.('change', onMotion);
    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
      motionQuery?.removeEventListener?.('change', onMotion);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      width={COLS}
      height={ROWS}
      role="img"
      aria-label="Animated pixel mosaic of a beach with palm trees, a sailboat, and a setting sun"
      className={`mosaic-pixelated ${className}`}
    />
  );
}
