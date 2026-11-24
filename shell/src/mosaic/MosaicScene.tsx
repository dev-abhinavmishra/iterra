/* MosaicScene — an animated pixel mosaic: a calm morning terrace garden
   painted into an ImageData buffer where every "tile" is one canvas pixel,
   scaled up by CSS (image-rendering: pixelated). Rendered at 320×180 so
   tiles stay fine-grained even on large displays.

   The scene is a layered green terrace: a soft sky with a slow sun and
   drifting clouds, a hazy tree line, then four planted bands stepping
   down toward the viewer — each with a stone coping edge, textured
   foliage, a pond with spreading ripples, stepping stones, topiary,
   flower clusters, butterflies and drifting petals. Every cell carries
   a slow colour shimmer. Honours prefers-reduced-motion (single frame)
   and pauses offscreen.

   Perf notes: the pixel loop works on raw r/g/b numbers (no per-pixel
   array allocation), the shimmer is two table lookups instead of three
   sin() calls per pixel, per-row band/gradient factors are hoisted, and
   the expensive sun/cloud/pond math is bbox-rejected. */
import { useEffect, useRef } from 'react';

const COLS = 320;
const ROWS = 180;

const HORIZON = 66; // sky | garden boundary

const C = {
  skyTop: [132, 188, 212],
  skyMid: [190, 218, 200],
  horizon: [238, 234, 208],
  sunCore: [255, 238, 172],
  sunEdge: [238, 186, 104],
  cloud: [252, 250, 240],
  cloudShade: [212, 204, 178],
  farTree: [104, 146, 96],
  farTreeDeep: [84, 124, 80],
  bird: [62, 74, 82],
  /* terraces — back to front */
  t1Top: [104, 146, 82], t1Bot: [80, 116, 64],
  t2Top: [86, 132, 68], t2Bot: [62, 104, 52],
  t3Top: [96, 142, 70], t3Bot: [70, 112, 54],
  t4Top: [72, 118, 58], t4Bot: [42, 78, 38],
  coping: [186, 176, 146],
  copingDark: [150, 140, 112],
  copingHi: [214, 206, 178],
  leafDark: [36, 74, 38],
  leafLight: [128, 168, 82],
  /* pond */
  waterTop: [126, 198, 182],
  waterBot: [66, 148, 148],
  ripple: [226, 246, 232],
  lily: [58, 128, 74],
  /* props */
  stone: [188, 178, 148],
  stoneDark: [140, 130, 104],
  soil: [112, 80, 54],
  planter: [156, 108, 68],
  trunk: [118, 78, 48],
  topiaryDeep: [30, 68, 34],
  topiaryMid: [52, 104, 52],
  topiaryLight: [88, 142, 66],
  /* flowers + actors */
  petalPink: [236, 128, 140],
  petalCream: [250, 226, 160],
  petalViolet: [206, 158, 210],
  petalWhite: [248, 244, 230],
  bloom: [240, 196, 92],
  wingA: [234, 138, 84],
  wingB: [198, 120, 190],
  wingC: [240, 208, 96],
  body: [70, 52, 40],
  petal: [250, 226, 230],
  petal2: [252, 240, 214],
} as const;

type RGB = readonly [number, number, number];

/* sprite map cell codes → colours. 1-3 butterflies (wings/body),
   4-5 drifting petals. Everything that moves independently of the pixel
   grid is rasterized into this map once per frame, so the pixel loop
   stays one lookup per pixel. */
const SPRITE_COLORS: RGB[] = [
  C.wingA, C.wingB, C.wingC, C.body, C.petal, C.petal2,
];

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
   320×180, so speckle/texture use this instead */
const ihash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

/* scene anchors */
const SUN = { x: 62, y: 26, r: 10 };
const SUN_GLOW_R = SUN.r + 9 + 1; // max radius incl. pulse
const CLOUDS = [
  { x: 120, y: 14, w: 36, h: 9, sp: 1.6 },
  { x: 230, y: 8, w: 24, h: 7, sp: 2.4 },
  { x: 286, y: 34, w: 18, h: 6, sp: 3.2 },
];
/* distant tree line — rounded canopies on the horizon */
const FAR_TREES = [
  { x: 30, r: 12, h: 9 },
  { x: 78, r: 15, h: 12 },
  { x: 140, r: 11, h: 8 },
  { x: 205, r: 14, h: 11 },
  { x: 262, r: 12, h: 9 },
  { x: 305, r: 10, h: 7 },
];
/* terrace bands: [top, bottom) — each gets a 2px stone coping at its top */
const TERRACES = [
  { y0: 66, y1: 90, top: C.t1Top, bot: C.t1Bot },
  { y0: 91, y1: 114, top: C.t2Top, bot: C.t2Bot },
  { y0: 115, y1: 142, top: C.t3Top, bot: C.t3Bot },
  { y0: 143, y1: ROWS, top: C.t4Top, bot: C.t4Bot },
];
const COPING_H = 2;
/* pond on the second terrace — ellipse + animated ripple rings + lilies */
const POND = { cx: 216, cy: 102, rx: 36, ry: 6.5 };
const LILIES = [
  { dx: -14, dy: -1, rx: 5, ry: 1.6 },
  { dx: 8, dy: 1, rx: 4, ry: 1.4 },
  { dx: 22, dy: -1, rx: 3.5, ry: 1.2 },
];
/* stepping stones wandering down from the pond to the foreground */
const STONES = [
  { x: 176, y: 118, rx: 7, ry: 2.4 },
  { x: 162, y: 130, rx: 6, ry: 2.2 },
  { x: 154, y: 144, rx: 6.5, ry: 2.3 },
  { x: 148, y: 160, rx: 7, ry: 2.5 },
  { x: 146, y: 174, rx: 8, ry: 2.6 },
];
/* topiary — sphere on a trunk, planted in a box on each middle terrace */
const TOPIARY = [
  { x: 104, base: 100, r: 8, ph: 0 },
  { x: 262, base: 124, r: 7, ph: 2 },
  { x: 66, base: 152, r: 8, ph: 4 },
];
const PLANTERS = TOPIARY.map((tp) => ({ x0: tp.x - 9, x1: tp.x + 9, y0: tp.base - 1, y1: tp.base + 4 }));
/* flower clusters — deterministic scatter on the lower terraces */
const FLOWERS = [
  { x: 40, y: 122, c: 0, ph: 0.0 }, { x: 58, y: 128, c: 1, ph: 1.1 },
  { x: 86, y: 120, c: 2, ph: 2.2 }, { x: 122, y: 126, c: 0, ph: 0.6 },
  { x: 238, y: 124, c: 1, ph: 1.7 }, { x: 268, y: 120, c: 2, ph: 2.9 },
  { x: 296, y: 128, c: 0, ph: 0.3 }, { x: 30, y: 150, c: 2, ph: 1.4 },
  { x: 96, y: 154, c: 1, ph: 2.5 }, { x: 210, y: 152, c: 0, ph: 0.9 },
  { x: 262, y: 158, c: 2, ph: 1.9 }, { x: 300, y: 150, c: 1, ph: 0.2 },
  { x: 52, y: 168, c: 0, ph: 1.2 }, { x: 118, y: 170, c: 2, ph: 2.8 },
  { x: 196, y: 166, c: 1, ph: 0.5 }, { x: 250, y: 172, c: 0, ph: 1.6 },
  { x: 292, y: 168, c: 2, ph: 2.1 },
];
const FLOWER_RGB: RGB[] = [C.petalPink, C.petalCream, C.petalViolet];
/* butterflies — lazy lissajous loops around the flower beds */
const BUTTERFLIES = [
  { cx: 90, cy: 132, rx: 26, ry: 9, sx: 0.55, sy: 0.9, ph: 0.0, col: 0 },
  { cx: 235, cy: 148, rx: 30, ry: 8, sx: 0.42, sy: 0.7, ph: 2.4, col: 1 },
  { cx: 160, cy: 112, rx: 20, ry: 6, sx: 0.7, sy: 1.1, ph: 4.2, col: 2 },
];
/* petals drifting down across the garden */
const PETALS = [
  { x: 30, y0: 90, sp: 4.5, ph: 0.0, c: 0 },
  { x: 150, y0: 100, sp: 3.6, ph: 1.7, c: 1 },
  { x: 250, y0: 96, sp: 5.0, ph: 3.1, c: 0 },
  { x: 200, y0: 120, sp: 4.0, ph: 4.6, c: 1 },
];

/* per-row precomputes — terrace index, local gradient factor, sky factor */
const ROW = {
  skyT: new Float32Array(ROWS),
  terr: new Int8Array(ROWS),
  terrK: new Float32Array(ROWS),
};
for (let y = 0; y < ROWS; y++) {
  ROW.skyT[y] = y / HORIZON;
  ROW.terr[y] = -1;
  ROW.terrK[y] = 0;
  for (let ti = 0; ti < TERRACES.length; ti++) {
    const tr = TERRACES[ti];
    if (y >= tr.y0 && y < tr.y1) {
      ROW.terr[y] = ti;
      ROW.terrK[y] = (y - tr.y0) / (tr.y1 - tr.y0);
      break;
    }
  }
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
   Covers butterflies and drifting petals. */
let spriteBuf = new Uint8Array(0);
function buildSpriteMap(t: number): Uint8Array {
  const map = spriteBuf.length === COLS * ROWS ? spriteBuf : (spriteBuf = new Uint8Array(COLS * ROWS));
  map.fill(0);
  const put = (x: number, y: number, code: number) => {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi >= 0 && xi < COLS && yi >= 0 && yi < ROWS) map[yi * COLS + xi] = code;
  };
  /* butterflies — two flapping wing pixels each side of a body dot;
     wing spread breathes with a fast flap */
  for (const bf of BUTTERFLIES) {
    const bx = bf.cx + Math.sin(t * bf.sx + bf.ph) * bf.rx + Math.sin(t * 1.7 + bf.ph) * 3;
    const by = bf.cy + Math.sin(t * bf.sy + bf.ph * 1.3) * bf.ry;
    const flap = Math.sin(t * 9 + bf.ph) > 0 ? 1 : 0;
    const wc = 1 + (bf.col % 3); // wing colour rotates per butterfly
    put(bx, by, 4); // body
    if (flap) {
      put(bx - 1, by - 1, wc); put(bx + 1, by - 1, wc);
      put(bx - 2, by, wc);     put(bx + 2, by, wc);
      put(bx - 1, by + 1, wc); put(bx + 1, by + 1, wc);
    } else {
      put(bx - 1, by, wc); put(bx + 1, by, wc);
      put(bx, by - 2, wc); put(bx, by + 2, wc);
    }
  }
  /* petals — slow fall with a lazy horizontal sway, respawn at top */
  for (const p of PETALS) {
    const fall = (p.y0 + t * p.sp) % 92;
    const px = p.x + Math.sin(t * 0.7 + p.ph) * 9 + Math.sin(t * 0.23 + p.ph) * 14;
    const py = 74 + fall;
    const fade = fall > 78 ? (92 - fall) / 14 : 1;
    if (fade <= 0.05) continue;
    put(px, py, 5 + (p.c % 2));
    if (ihash(Math.round(px), Math.round(py)) > 0.55) put(px + 1, py, 5 + (p.c % 2));
  }
  return map;
}

function paintFrame(data: Uint8ClampedArray, t: number) {
  shimmerTables(t);
  const sunGlow2 = SUN_GLOW_R * SUN_GLOW_R;
  const sunRayIn2 = (SUN.r + 4) * (SUN.r + 4);
  const sunRayOut2 = (SUN.r + 9) * (SUN.r + 9);
  const pulse = Math.sin(t * 0.7) * 0.8;
  const glowR = SUN.r + 9 + pulse;
  const discR = SUN.r + pulse;
  /* precompute cloud screen x once per frame */
  const cloudX = CLOUDS.map((cl) => ((cl.x + t * cl.sp) % (COLS + 60)) - 30);
  /* precompute bird screen x/y once per frame */
  const birdX = [0, 1, 2].map((off) => ((t * (8 + off * 3.4) + off * 130) % (COLS + 48)) - 24);
  const birdY = [0, 1, 2].map((off) => 16 + off * 9 + Math.sin(t * 0.8 + off * 2.2) * 3);
  /* pond ripple — one ring expands every 3.6s */
  const ripplePh = (t % 3.6) / 3.6;
  const rippleR = ripplePh * Math.max(POND.rx, POND.ry * 5);
  const sprites = buildSpriteMap(t);

  let i = 0;
  for (let y = 0; y < ROWS; y++) {
    const isSky = y < HORIZON;
    const terr = ROW.terr[y];
    const tr = terr >= 0 ? TERRACES[terr] : null;
    for (let x = 0; x < COLS; x++, i += 4) {
      let r: number, g: number, b: number;

      if (isSky) {
        /* ── sky ── */
        const tt = ROW.skyT[y];
        if (tt < 0.55) {
          const k = tt / 0.55;
          r = lerp(C.skyTop[0], C.skyMid[0], k);
          g = lerp(C.skyTop[1], C.skyMid[1], k);
          b = lerp(C.skyTop[2], C.skyMid[2], k);
        } else {
          const k = (tt - 0.55) / 0.45;
          r = lerp(C.skyMid[0], C.horizon[0], k);
          g = lerp(C.skyMid[1], C.horizon[1], k);
          b = lerp(C.skyMid[2], C.horizon[2], k);
        }
        /* distant tree line — bumpy canopy silhouettes on the horizon */
        if (y >= HORIZON - 8) {
          let canopy = -1;
          for (const tr2 of FAR_TREES) {
            const dx = (x - tr2.x) / tr2.r;
            const dy = (y - (HORIZON - tr2.h)) / tr2.h;
            if (dx * dx + dy * dy <= 1 && y >= HORIZON - tr2.h - 2) {
              canopy = Math.max(canopy, 1 - dy * 0.4);
            }
          }
          if (canopy > 0) {
            const depth = canopy;
            const m = blend(r, g, b, depth > 0.6 ? C.farTree : C.farTreeDeep, 0.9);
            r = m[0]; g = m[1]; b = m[2];
          }
        }
        /* sun — squared-distance rejects keep hypot/atan2 off the hot path */
        const sdx = x - SUN.x, sdy = y - SUN.y;
        const d2 = sdx * sdx + sdy * sdy;
        if (d2 < sunGlow2) {
          const d = Math.sqrt(d2);
          const m = blend(r, g, b, C.sunEdge, (1 - d / glowR) * 0.45);
          r = m[0]; g = m[1]; b = m[2];
          if (d < discR) {
            const m2 = blend(C.sunEdge[0], C.sunEdge[1], C.sunEdge[2], C.sunCore, clamp(d / discR) * 0.4 + 0.35);
            r = lerp(r, m2[0], 0.85); g = lerp(g, m2[1], 0.85); b = lerp(b, m2[2], 0.85);
          }
          /* slow rotating ray ticks — only inside the thin ray band */
          if (d2 > sunRayIn2 && d2 < sunRayOut2) {
            const ang = Math.atan2(sdy, sdx);
            const rayPhase = (ang + t * 0.18) % (Math.PI / 4);
            if (Math.abs(rayPhase - Math.PI / 8) < 0.1 && Math.sin(t * 1.6) > -0.5) {
              const m3 = blend(r, g, b, C.sunEdge, 0.4);
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
            const m = blend(r, g, b, y > cl.y + cl.h * 0.45 ? C.cloudShade : C.cloud, 0.9);
            r = m[0]; g = m[1]; b = m[2];
          }
        }
        for (let bi = 0; bi < 3; bi++) {
          const bx = birdX[bi], by = birdY[bi];
          if (x < bx - 3 || x > bx + 3 || y < by - 3 || y > by + 3) continue;
          if (Math.abs(x - bx) + Math.abs(y - by) <= 2.4) { r = C.bird[0]; g = C.bird[1]; b = C.bird[2]; }
        }
      } else if (tr) {
        /* ── garden terrace ── */
        const k = ROW.terrK[y];
        const tt = tr.top, tb = tr.bot;
        r = lerp(tt[0], tb[0], k);
        g = lerp(tt[1], tb[1], k);
        b = lerp(tt[2], tb[2], k);
        /* stone coping — 2px cap with a lit top edge and joint shadows */
        const cy = y - tr.y0;
        if (cy < COPING_H) {
          const joint = cy === 1 && Math.floor(x / 9) !== Math.floor((x - 1) / 9);
          const cc = cy === 0 ? C.copingHi : joint ? C.copingDark : C.coping;
          r = cc[0]; g = cc[1]; b = cc[2];
        } else {
          /* foliage texture — sparse light/dark leaf dabs, denser near top */
          const h1 = ihash(x, y);
          const density = 0.9 - k * 0.45;
          if (h1 > 1.0 - density * 0.09) {
            const m = blend(r, g, b, h1 > 0.986 ? C.leafDark : C.leafLight, 0.5);
            r = m[0]; g = m[1]; b = m[2];
          }
          /* soft shadow just under the coping */
          if (cy === COPING_H) {
            const m = blend(r, g, b, C.leafDark, 0.28);
            r = m[0]; g = m[1]; b = m[2];
          }
        }
        /* pond — ellipse water with expanding ripple rings and lily pads */
        if (terr === 1) {
          const pdx = (x - POND.cx) / POND.rx;
          const pdy = (y - POND.cy) / POND.ry;
          const pd = pdx * pdx + pdy * pdy;
          if (pd <= 1) {
            const wk = clamp((pdy + 1) / 2);
            r = lerp(C.waterTop[0], C.waterBot[0], wk);
            g = lerp(C.waterTop[1], C.waterBot[1], wk);
            b = lerp(C.waterTop[2], C.waterBot[2], wk);
            /* ripple ring — normalized radius sweep; only near the rim */
            const rr = Math.sqrt(pd);
            if (ripplePh < 0.9 && Math.abs(rr - rippleR / POND.rx) < 0.05) {
              const m = blend(r, g, b, C.ripple, (1 - ripplePh) * 0.8);
              r = m[0]; g = m[1]; b = m[2];
            }
            /* sparkle */
            if (ihash(x * 3, y * 7) > 0.988 && Math.sin(t * 2.2 + x * 0.5 + y * 1.3) > 0.2) {
              const m = blend(r, g, b, C.ripple, 0.7); r = m[0]; g = m[1]; b = m[2];
            }
          }
          for (const lily of LILIES) {
            const lx = POND.cx + lily.dx, ly = POND.cy + lily.dy;
            const ldx = (x - lx) / lily.rx, ldy = (y - ly) / lily.ry;
            if (ldx * ldx + ldy * ldy <= 1) { r = C.lily[0]; g = C.lily[1]; b = C.lily[2]; }
          }
        }
        /* stepping stones — flat ellipses down the garden axis */
        for (const st of STONES) {
          const sdx = (x - st.x) / st.rx, sdy = (y - st.y) / st.ry;
          if (sdx * sdx + sdy * sdy <= 1) {
            const top = y < st.y - 0.4;
            const cc = top ? C.copingHi : sdy > 0.4 ? C.stoneDark : C.stone;
            r = cc[0]; g = cc[1]; b = cc[2];
            break;
          }
        }
        /* planters + topiary spheres */
        for (let pi = 0; pi < TOPIARY.length; pi++) {
          const tp = TOPIARY[pi], pl = PLANTERS[pi];
          if (x >= pl.x0 && x <= pl.x1 && y >= pl.y0 && y <= pl.y1) {
            r = C.soil[0]; g = C.soil[1]; b = C.soil[2];
          }
          /* trunk — short stake below the sphere into the planter */
          if (Math.abs(x - tp.x) <= 1 && y > tp.base - 5 && y <= tp.base) {
            r = C.trunk[0]; g = C.trunk[1]; b = C.trunk[2];
          }
          /* sphere — shaded by height for a rounded read */
          const tdx = x - tp.x, tdy = y - (tp.base - tp.r - 2);
          const td = Math.sqrt(tdx * tdx + tdy * tdy);
          if (td <= tp.r) {
            const shade = clamp(0.5 + tdy / (tp.r * 2));
            const cc = shade > 0.72 ? C.topiaryLight : shade > 0.45 ? C.topiaryMid : C.topiaryDeep;
            const m = blend(r, g, b, cc, 0.92);
            r = m[0]; g = m[1]; b = m[2];
          }
        }
        /* flower clusters — five-petal plus with a bright centre */
        for (const fl of FLOWERS) {
          const fdx = Math.abs(x - fl.x), fdy = Math.abs(y - fl.y);
          if (fdx + fdy <= 2 && !(fdx === 0 && fdy === 0)) {
            const cc = FLOWER_RGB[fl.c];
            /* gentle per-flower pulse keeps the bed alive */
            const pulse2 = 0.75 + 0.25 * Math.sin(t * 1.4 + fl.ph);
            r = lerp(r, cc[0], pulse2); g = lerp(g, cc[1], pulse2); b = lerp(b, cc[2], pulse2);
          } else if (fdx === 0 && fdy === 0) {
            r = C.bloom[0]; g = C.bloom[1]; b = C.bloom[2];
          }
        }
      } else {
        /* ── below the terraces (shouldn't happen — ROWS covered) ── */
        r = C.t4Bot[0]; g = C.t4Bot[1]; b = C.t4Bot[2];
      }

      /* sprite overlay — butterflies + petals */
      const sp = sprites[y * COLS + x];
      if (sp) {
        const pc = SPRITE_COLORS[sp - 1];
        const j = i;
        data[j] = pc[0];
        data[j + 1] = pc[1];
        data[j + 2] = pc[2];
        data[j + 3] = 255;
        continue;
      }

      /* ── shimmer ── */
      const sh = 1 + 0.035 * SHIM_A[(x + y) & 511] + 0.018 * SHIM_B[(x * 2 - y + 1024) & 1023];
      data[i] = clamp(r * sh, 0, 255);
      data[i + 1] = clamp(g * sh, 0, 255);
      data[i + 2] = clamp(b * sh, 0, 255);
      data[i + 3] = 255;
    }
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
    const mql =
      typeof window !== 'undefined'
        ? window.matchMedia?.('(prefers-reduced-motion: reduce)')
        : undefined;
    let reduced = mql?.matches ?? false;
    let raf = 0;
    let visible = true;
    const t0 = performance.now();
    const paint = (t: number) => {
      paintFrame(img.data, t);
      ctx.putImageData(img, 0, 0);
    };
    const frame = (now: number) => {
      paint((now - t0) / 1000);
      if (!reduced && visible) raf = requestAnimationFrame(frame);
    };
    const kick = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    };
    /* live preference — turning reduce on mid-session stops after this
       frame; turning it off resumes the loop */
    const onMotion = () => {
      reduced = mql?.matches ?? false;
      if (reduced) cancelAnimationFrame(raf);
      else if (visible) kick();
    };
    mql?.addEventListener?.('change', onMotion);
    /* first frame synchronously — rAF can be throttled indefinitely while
       the tab is hidden, which would leave the canvas blank */
    paint(0);
    if (!reduced) raf = requestAnimationFrame(frame);
    /* pause the loop while the mosaic is scrolled out of view */
    let io: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver((entries) => {
        visible = entries[0]?.isIntersecting ?? true;
        if (visible && !reduced) kick();
      });
      io.observe(canvas);
    }
    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
      mql?.removeEventListener?.('change', onMotion);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      width={COLS}
      height={ROWS}
      role="img"
      aria-label="Animated pixel mosaic of a terraced garden with a pond, topiary, flowers, and butterflies"
      className={`mosaic-pixelated ${className}`}
    />
  );
}
