/* Procedural pixel-mosaic objects — the same jade/limestone/gold tesserae
   language as the atlas globe, painted into a low-res grid and upscaled
   with image-rendering: pixelated. Each "pixel" reads as one mosaic tile.

   Painters work in a normalized S×S space; callers pick the resolution
   (32–48 keeps tiles coarse enough to read as mosaic, not photo). */

type Ctx = CanvasRenderingContext2D;

const mix = (a: readonly number[], b: readonly number[], t: number) =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(
    a[1] + (b[1] - a[1]) * t,
  )},${Math.round(a[2] + (b[2] - a[2]) * t)})`;

/* blend an already-stringified rgb() color toward a palette entry — the
   painters keep `col` as a string, so palette mixes go through this */
const mixCss = (css: string, c: readonly number[], t: number) => {
  const m = css.match(/\d+/g);
  if (!m || m.length < 3) return css;
  return `rgb(${Math.round(+m[0] + (c[0] - +m[0]) * t)},${Math.round(
    +m[1] + (c[1] - +m[1]) * t,
  )},${Math.round(+m[2] + (c[2] - +m[2]) * t)})`;
};

/* atlas palette — deep jungle jade, limestone parchment, worked gold,
   a terracotta accent for the needle/star points */
const P = {
  ink: [14, 36, 26],
  deep: [23, 56, 42],
  jade: [46, 92, 64],
  moss: [77, 125, 85],
  sage: [127, 174, 139],
  parch: [239, 229, 201],
  cream: [248, 241, 220],
  gold: [217, 198, 144],
  goldL: [240, 223, 174],
  terra: [192, 90, 52],
  terraL: [224, 138, 90],
  wood: [110, 74, 46],
  woodD: [74, 47, 28],
} as const;

const px = (ctx: Ctx, x: number, y: number, s: number, color: string) => {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(s), Math.round(s));
};

/* soft top-left key light baked per object: lit toward (−,−), shaded toward
   (+,+) — gives every tile a faceted, carved-stone read */
const light = (x: number, y: number, S: number, strength = 0.32) => {
  const dx = (x + 0.5 - S / 2) / (S / 2);
  const dy = (y + 0.5 - S / 2) / (S / 2);
  return 1 + (-(dx + dy) * 0.5 - (dx * dx + dy * dy) * 0.35) * strength;
};
const shade = (base: readonly number[], x: number, y: number, S: number, k = 0.32) => {
  const f = light(x, y, S, k);
  return `rgb(${Math.round(base[0] * f)},${Math.round(base[1] * f)},${Math.round(
    base[2] * f,
  )})`;
};

/* ── compass — Courses' instrument: gold bezel, parchment face, cardinal
   ticks, a jade-and-terracotta needle. Spherical face shading sells the
   3D; the needle is a tapered diamond. ── */
function paintCompass(ctx: Ctx, S: number) {
  const cx = S / 2;
  const R_OUT = S * 0.46;
  const R_RING = S * 0.405;
  const R_FACE = S * 0.36;
  const inkR = S * 0.485;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cx;
      const d = Math.hypot(dx, dy);
      if (d > inkR) continue;
      const ang = Math.atan2(dy, dx);
      /* outer ink rim */
      if (d > R_OUT) { px(ctx, x, y, 1, shade(P.ink, x, y, S, 0.15)); continue; }
      /* gold bezel ring */
      if (d > R_RING) {
        /* bezel notches — 8 small darker rivets between cardinals */
        const notch = Math.abs((((ang + Math.PI / 8) % (Math.PI / 4)) + Math.PI / 4) % (Math.PI / 4) - Math.PI / 8);
        const rivet = notch < 0.045 && d > (R_RING + R_OUT) / 2;
        px(ctx, x, y, 1, rivet ? shade(P.gold, x, y, S, 0.5) : shade(P.gold, x, y, S));
        continue;
      }
      /* parchment face with carved-sphere shading + rim vignette */
      if (d <= R_FACE) {
        const vig = 1 - Math.pow(d / R_FACE, 2.4) * 0.3;
        const f = vig * light(x, y, S, 0.4);
        const b = P.parch;
        let c = `rgb(${Math.round(b[0] * f)},${Math.round(b[1] * f)},${Math.round(b[2] * f)})`;
        /* faint engraved latitude rings */
        const rr = d / R_FACE;
        if (Math.abs(rr - 0.62) < 0.02 || Math.abs(rr - 0.3) < 0.015) {
          c = mix(P.parch, P.sage, 0.35);
        }
        /* cardinal ticks — longer at N/E/S/W, thin gold elsewhere */
        const deg = ((ang * 180) / Math.PI + 360) % 360;
        const tickBand = 6.2;
        const near = [0, 90, 180, 270].some((c0) => Math.min(Math.abs(deg - c0), 360 - Math.abs(deg - c0)) < tickBand);
        const mid = !near && [45, 135, 225, 315].some((c0) => Math.min(Math.abs(deg - c0), 360 - Math.abs(deg - c0)) < 5);
        if (near && d > R_FACE - S * 0.075 && d < R_FACE - S * 0.01) {
          c = shade(P.ink, x, y, S, 0.1);
        } else if (mid && d > R_FACE - S * 0.05 && d < R_FACE - S * 0.015) {
          c = shade(P.gold, x, y, S, 0.4);
        } else if (d > R_FACE - S * 0.02) {
          c = shade(P.sage, x, y, S, 0.5);
        }
        /* needle — tapered diamond along the N-S axis; jade south,
           terracotta north, gold pivot cap */
        const ny = dy / (R_FACE - S * 0.03);
        const halfW = Math.max(0, 1 - Math.abs(ny)) * (S * 0.052);
        if (Math.abs(dx) <= halfW && Math.abs(ny) <= 1 && d > S * 0.045) {
          c = ny < 0 ? shade(P.terra, x, y, S, 0.3) : shade(P.jade, x, y, S, 0.3);
          if (Math.abs(dx) < halfW * 0.4) c = shade(ny < 0 ? P.terraL : P.sage, x, y, S, 0.25);
        }
        if (d <= S * 0.035) c = shade(P.goldL, x, y, S, 0.2);
        if (d <= S * 0.014) c = shade(P.ink, x, y, S, 0.1);
        px(ctx, x, y, 1, c);
        continue;
      }
      /* inner bezel shadow line between face and ring */
      px(ctx, x, y, 1, shade(P.deep, x, y, S, 0.5));
    }
  }
}

/* ── books — the Stacks' stack: three closed volumes with spine strips,
   page edges, gold title bands, and a hanging bookmark. ── */
type BookSpec = {
  x: number; y: number; w: number; h: number;
  cover: readonly number[];
  spine: readonly number[];
  band?: boolean;
};

function paintBook(ctx: Ctx, S: number, b: BookSpec) {
  const { x, y, w, h } = b;
  const X = (v: number) => Math.round(v * S);
  const Y = (v: number) => Math.round(v * S);
  const W = Math.round(w * S);
  const H = Math.round(h * S);
  const bx = X(x), by = Y(y);
  /* drop shadow */
  ctx.fillStyle = 'rgba(8,20,14,0.35)';
  ctx.fillRect(bx + 2, by + H - 1, W - 1, 3);
  for (let yy = 0; yy < H; yy++) {
    for (let xx = 0; xx < W; xx++) {
      const gx = bx + xx, gy = by + yy;
      /* ink outline */
      if (xx === 0 || yy === 0 || xx === W - 1 || yy === H - 1) {
        px(ctx, gx, gy, 1, shade(P.ink, gx, gy, S, 0.1));
        continue;
      }
      /* spine strip on the left */
      if (xx < Math.max(2, W * 0.16)) {
        px(ctx, gx, gy, 1, shade(b.spine, gx, gy, S, yy < H * 0.3 ? 0.25 : 0.45));
        continue;
      }
      /* top face — lighter cover (book thickness) */
      if (yy < Math.max(2, H * 0.22)) {
        px(ctx, gx, gy, 1, mix(b.cover, P.cream, 0.3));
        continue;
      }
      /* bottom edge — darker cover */
      if (yy > H * 0.82) {
        px(ctx, gx, gy, 1, mix(b.cover, P.ink, 0.4));
        continue;
      }
      /* page block on the right edge */
      if (xx > W * 0.9) {
        px(ctx, gx, gy, 1, yy % 3 === 0 ? shade(P.parch, gx, gy, S, 0.3) : mix(P.parch, b.cover, 0.25));
        continue;
      }
      /* cover field with carved shading */
      let c = shade(b.cover, gx, gy, S, 0.38);
      /* gold title band */
      if (b.band && yy > H * 0.4 && yy < H * 0.52 && xx > W * 0.2 && xx < W * 0.78) {
        c = shade(P.gold, gx, gy, S, 0.3);
      }
      px(ctx, gx, gy, 1, c);
    }
  }
}

function paintBooks(ctx: Ctx, S: number) {
  /* bottom → top, each narrower; slight right drift upward for a
     hand-stacked read */
  paintBook(ctx, S, { x: 0.10, y: 0.62, w: 0.80, h: 0.22, cover: P.terra, spine: P.woodD, band: true });
  paintBook(ctx, S, { x: 0.16, y: 0.40, w: 0.66, h: 0.20, cover: P.parch, spine: P.wood, band: true });
  paintBook(ctx, S, { x: 0.24, y: 0.20, w: 0.50, h: 0.19, cover: P.jade, spine: P.deep, band: true });
  /* bookmark ribbon — hangs off the top book's fore-edge */
  const bx = Math.round(0.66 * S);
  const by = Math.round(0.20 * S);
  const bw = Math.max(1, Math.round(S * 0.035));
  const bh = Math.round(S * 0.42);
  for (let i = 0; i < bh; i++) {
    const notch = i > bh * 0.7 && (i - bh * 0.7) % 3 === 0;
    if (notch) continue;
    for (let j = 0; j < bw; j++) {
      px(ctx, bx + j, by + i, 1, shade(i < bh * 0.3 ? P.goldL : P.gold, bx + j, by + i, S, 0.3));
    }
  }
}

/* ── cards — the Cardfile's stack: three leaning flashcards, parchment
   faces ruled with jade lines, a terracotta clip on the top card. ── */
function paintCards(ctx: Ctx, S: number) {
  /* back card — deepest lean, terracotta cover edge visible */
  const back = { cx: 0.5, cy: 0.56, w: 0.62, h: 0.34, rot: -0.10, cover: P.terra };
  const mid = { cx: 0.5, cy: 0.52, w: 0.60, h: 0.34, rot: 0.07, cover: P.parch };
  const front = { cx: 0.5, cy: 0.47, w: 0.58, h: 0.34, rot: -0.03, cover: P.cream };
  const draw = (c: { cx: number; cy: number; w: number; h: number; rot: number; cover: readonly number[] }, lines: number, clip: boolean) => {
    const hw = (c.w * S) / 2, hh = (c.h * S) / 2;
    const cos = Math.cos(c.rot), sin = Math.sin(c.rot);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        /* rotate into card space */
        const dx = x + 0.5 - c.cx * S;
        const dy = y + 0.5 - c.cy * S;
        const lx = (dx * cos + dy * sin) / hw;
        const ly = (-dx * sin + dy * cos) / hh;
        if (Math.abs(lx) > 1 || Math.abs(ly) > 1) continue;
        const gx = x, gy = y;
        /* ink keyline + cover rim */
        if (Math.abs(Math.abs(lx) - 1) < 0.045 || Math.abs(Math.abs(ly) - 1) < 0.045) {
          px(ctx, gx, gy, 1, shade(P.ink, gx, gy, S, 0.1));
          continue;
        }
        /* page field with carved shading */
        let col = shade(c.cover, gx, gy, S, 0.36);
        /* ruled answer lines — jade on parchment, inset from edges */
        const row = Math.floor((ly + 1) * (lines + 1) * 0.5);
        const inLine = Math.abs((ly + 1) * (lines + 1) * 0.5 - row - 0.5) < 0.16;
        if (inLine && Math.abs(lx) < 0.82 && ly < 0.55) {
          col = shade(P.jade, gx, gy, S, 0.45);
        }
        /* gold foil band near the card foot */
        if (ly > 0.62 && ly < 0.72 && Math.abs(lx) < 0.7) {
          col = shade(P.gold, gx, gy, S, 0.3);
        }
        px(ctx, gx, gy, 1, col);
      }
    }
    if (clip) {
      /* binder clip — gold saddle across the top edge */
      const cxp = Math.round(c.cx * S);
      const cyp = Math.round((c.cy - c.h / 2 + 0.015) * S);
      for (let i = -3; i <= 3; i++) {
        px(ctx, cxp + i, cyp, 1, shade(P.goldL, cxp + i, cyp, S, 0.15));
        px(ctx, cxp + i, cyp + 1, 1, shade(P.gold, cxp + i, cyp + 1, S, 0.3));
      }
    }
  };
  draw(back, 3, false);
  draw(mid, 4, false);
  draw(front, 5, true);
}

/* ── hourglass — the Timer's instrument: turned wooden caps, ink frame
   posts, and two bulbs of falling gold sand meeting at the waist. ── */
function paintHourglass(ctx: Ctx, S: number) {
  const cx = S / 2;
  const top = S * 0.1, bot = S * 0.9, waist = S * 0.5;
  const maxHalf = S * 0.24;
  /* wooden caps + posts */
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const inCap = (y >= top - S * 0.035 && y <= top + S * 0.02) || (y >= bot - S * 0.02 && y <= bot + S * 0.035);
      const inPost = (Math.abs(x - (cx - maxHalf - S * 0.03)) < S * 0.022 || Math.abs(x - (cx + maxHalf + S * 0.03)) < S * 0.022) && y > top && y < bot;
      if (inCap) {
        /* cap spans wider than the glass, slight dome shading */
        const capCx = cx, capW = maxHalf + S * 0.09;
        if (Math.abs(x - capCx) <= capW) {
          const up = y < top;
          px(ctx, x, y, 1, up ? shade(P.wood, x, y, S, 0.4) : shade(P.woodD, x, y, S, 0.4));
        }
        continue;
      }
      if (inPost) { px(ctx, x, y, 1, shade(P.woodD, x, y, S, 0.35)); continue; }
      if (y <= top || y >= bot) continue;
      /* glass bulbs — half-width pinches to the waist */
      const k = Math.abs(y - waist) / (bot - waist); // 1 at caps → 0 at waist
      const half = S * 0.015 + k * maxHalf;
      const lx = Math.abs(x - cx);
      if (lx > half) continue;
      /* glass edge */
      if (lx > half - S * 0.012) { px(ctx, x, y, 1, shade(P.ink, x, y, S, 0.3)); continue; }
      /* upper bulb holds settled sand, lower bulb is mostly empty glass
         with a rising pile at the waist */
      const fillLine = y < waist ? waist - k * S * 0.16 : waist + k * S * 0.10;
      const sandK = (y - fillLine) / Math.max(1, bot - top);
      let col: string;
      if (y < waist) {
        col = sandK > 0 ? shade(P.goldL, x, y, S, 0.35) : mix(P.parch, P.cream, 0.4);
      } else {
        /* falling stream — a thin gold thread at the waist */
        const stream = Math.abs(x - cx) < S * 0.008 && y > waist && y < waist + S * 0.12;
        col = stream ? shade(P.gold, x, y, S, 0.2) : sandK > 0.55 ? shade(P.gold, x, y, S, 0.4) : mix(P.parch, P.cream, 0.55);
      }
      px(ctx, x, y, 1, col);
    }
  }
}

/* ── ledger — Planning's register: a bound volume seen head-on, parchment
   pages ruled in sage, a terracotta margin line, gold spine bands and two
   binder rings. ── */
function paintLedger(ctx: Ctx, S: number) {
  const x0 = S * 0.14, x1 = S * 0.86, y0 = S * 0.1, y1 = S * 0.9;
  /* drop shadow */
  ctx.fillStyle = 'rgba(8,20,14,0.35)';
  ctx.fillRect(Math.round(x0) + 2, Math.round(y1) - 2, Math.round(x1 - x0), 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const gx = x, gy = y;
      const edge = x <= x0 + 1 || x >= x1 - 1 || y <= y0 + 1 || y >= y1 - 1;
      if (edge) { px(ctx, gx, gy, 1, shade(P.ink, gx, gy, S, 0.1)); continue; }
      /* spine — deeper jade column on the left third */
      if (x < x0 + (x1 - x0) * 0.22) {
        px(ctx, gx, gy, 1, shade(P.deep, gx, gy, S, 0.4));
        continue;
      }
      /* page field */
      let col = shade(P.parch, gx, gy, S, 0.34);
      /* terracotta margin rule */
      if (Math.abs(x - (x0 + (x1 - x0) * 0.3)) < 1) col = shade(P.terra, gx, gy, S, 0.4);
      /* sage ruled lines — every 4th cell row is a baseline, staggered
         entries between them read as handwriting */
      const row = (y - y0) % 4;
      const ruled = row === 2;
      const writing = row === 0 && ((x * 7 + y * 3) % 11) < 6;
      if (ruled) col = mixCss(col, P.sage, 0.5);
      else if (writing && x > x0 + (x1 - x0) * 0.34 && x < x1 - S * 0.04) {
        col = mixCss(col, P.jade, 0.45);
      }
      /* gold title band near the head */
      if (y < y0 + (y1 - y0) * 0.14 && x > x0 + (x1 - x0) * 0.26 && x < x1 - S * 0.05) {
        col = shade(P.gold, gx, gy, S, 0.35);
      }
      px(ctx, gx, gy, 1, col);
    }
  }
  /* binder rings — two gold loops off the spine edge */
  for (const ry of [y0 + (y1 - y0) * 0.3, y0 + (y1 - y0) * 0.68]) {
    for (let i = -2; i <= 2; i++) {
      px(ctx, Math.round(x0 - 1 + i * 0.4), Math.round(ry + i * i * 0.8), 1, shade(P.goldL, Math.round(x0 - 1 + i * 0.4), Math.round(ry + i * i * 0.8), S, 0.2));
    }
  }
}

/* ── wave — Rhythm's cadence: a skyline of weekly bars in jade, gold and
   terracotta rising off a baseline, tallest bar marking today. ── */
function paintWave(ctx: Ctx, S: number) {
  const bars = 7;
  const gap = S * 0.035;
  const bw = (S - gap * (bars + 1)) / bars;
  const heights = [0.34, 0.5, 0.42, 0.68, 0.55, 0.78, 0.48];
  const palette = [P.jade, P.gold, P.sage, P.terra, P.moss, P.goldL, P.jade];
  const base = S * 0.88;
  for (let b = 0; b < bars; b++) {
    const bx = gap + b * (bw + gap);
    const bh = heights[b] * S;
    const by = base - bh;
    const cover = palette[b];
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        if (x < bx || x > bx + bw || y < by || y > base) continue;
        /* only the bar's own column range, rounded top corners */
        const corner = Math.min(x - bx, bx + bw - x, S * 0.02);
        if (y < by + Math.max(0, S * 0.02 - corner) && corner < S * 0.02) continue;
        let col = shade(cover, x, y, S, 0.4);
        /* top edge highlight + bottom contact shadow */
        if (y < by + S * 0.02) col = shade(cover, x, y, S, 0.1);
        else if (y > base - S * 0.02) col = shade(P.ink, x, y, S, 0.3);
        px(ctx, x, y, 1, col);
      }
    }
  }
  /* baseline */
  for (let x = 0; x < S; x++) {
    px(ctx, x, Math.round(base) + 1, 1, shade(P.ink, x, Math.round(base) + 1, S, 0.1));
  }
}

/* ── grid — GradeStack's answer sheet: a parchment grid of bubbles, most
   empty, a column of filled terracotta answers, and a gold score tab. ── */
function paintGrid(ctx: Ctx, S: number) {
  const x0 = S * 0.12, x1 = S * 0.88, y0 = S * 0.1, y1 = S * 0.9;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      let col = shade(P.parch, x, y, S, 0.36);
      const edge = x <= x0 + 1 || x >= x1 - 1 || y <= y0 + 1 || y >= y1 - 1;
      if (edge) { px(ctx, x, y, 1, shade(P.ink, x, y, S, 0.1)); continue; }
      /* five answer columns of bubbles */
      const cols = 5, rowsN = 6;
      const gx = (x - x0) / (x1 - x0), gy = (y - y0) / (y1 - y0);
      const colI = Math.floor(gx * cols), rowI = Math.floor(gy * rowsN);
      const inCell = gx * cols - colI > 0.28 && gx * cols - colI < 0.72 && gy * rowsN - rowI > 0.24 && gy * rowsN - rowI < 0.76;
      if (inCell) {
        const cxu = (colI + 0.5) / cols, cyv = (rowI + 0.5) / rowsN;
        const d = Math.hypot((gx - cxu) * (x1 - x0) / S, (gy - cyv) * (y1 - y0) / S) * S;
        if (d < S * 0.028) {
          /* answer key fills column 1 (terracotta) and a few scattered */
          const filled = colI === 1 || (colI === 3 && rowI === 2) || (colI === 4 && rowI === 5) || (colI === 0 && rowI === 4);
          col = filled ? shade(P.terra, x, y, S, 0.35) : shade(P.sage, x, y, S, 0.5);
        } else if (d < S * 0.036) {
          col = shade(P.jade, x, y, S, 0.45);
        }
      }
      /* row rules between questions */
      if (((gy * rowsN) % 1) < 0.06 && gx > 0.06 && gx < 0.94) col = mixCss(col, P.sage, 0.4);
      px(ctx, x, y, 1, col);
    }
  }
  /* gold score tab on the right edge */
  for (let y = y0 + (y1 - y0) * 0.3; y < y0 + (y1 - y0) * 0.62; y++) {
    for (let i = 0; i < 3; i++) px(ctx, Math.round(x1 + 1 + i), Math.round(y), 1, shade(P.gold, Math.round(x1 + 1 + i), Math.round(y), S, 0.3));
  }
}

/* ── box — Boxed's daily board: an open wooden crate with three labelled
   blocks nested inside — jade, parchment, terracotta — lid ajar above. ── */
function paintBox(ctx: Ctx, S: number) {
  const x0 = S * 0.12, x1 = S * 0.88, y0 = S * 0.22, y1 = S * 0.88;
  /* lid — ajar plank above the crate */
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const lidY = y0 - S * 0.1 + Math.abs(x - S / 2) * 0.1;
      const inLid = y >= lidY && y <= lidY + S * 0.07 && x > x0 - S * 0.02 && x < x1 + S * 0.02;
      const inCrate = x >= x0 && x <= x1 && y >= y0 && y <= y1;
      if (!inLid && !inCrate) continue;
      const gx = x, gy = y;
      if (inLid) {
        const edge = y <= lidY + 1 || y >= lidY + S * 0.07 - 1 || x <= x0 - S * 0.02 + 1 || x >= x1 + S * 0.02 - 1;
        px(ctx, gx, gy, 1, edge ? shade(P.ink, gx, gy, S, 0.1) : shade(P.wood, gx, gy, S, 0.42));
        continue;
      }
      /* crate interior — dark, then blocks */
      let col = shade(P.woodD, gx, gy, S, 0.5);
      const edge = x <= x0 + 1 || x >= x1 - 1 || y <= y0 + 1 || y >= y1 - 1;
      if (edge) { px(ctx, gx, gy, 1, shade(P.ink, gx, gy, S, 0.1)); continue; }
      /* three blocks — jade tall, parch mid, terra small */
      const blocks = [
        { bx: x0 + (x1 - x0) * 0.16, bw: (x1 - x0) * 0.2, by: y1 - (y1 - y0) * 0.55, bh: (y1 - y0) * 0.55, c: P.jade },
        { bx: x0 + (x1 - x0) * 0.44, bw: (x1 - x0) * 0.24, by: y1 - (y1 - y0) * 0.42, bh: (y1 - y0) * 0.42, c: P.parch },
        { bx: x0 + (x1 - x0) * 0.74, bw: (x1 - x0) * 0.16, by: y1 - (y1 - y0) * 0.3, bh: (y1 - y0) * 0.3, c: P.terra },
      ];
      for (const b of blocks) {
        if (x >= b.bx && x <= b.bx + b.bw && y >= b.by && y <= y1 - S * 0.03) {
          col = shade(b.c, gx, gy, S, 0.38);
          break;
        }
      }
      /* plank seams on the front face */
      if (y > y0 + (y1 - y0) * 0.7 && (y - y0) % Math.round(S * 0.09) < 2) col = mixCss(col, P.woodD, 0.4);
      px(ctx, gx, gy, 1, col);
    }
  }
}

/* ── note — Ink's page: a parchment sheet with a folded corner, three
   jade text lines, and a terracotta ink blot. ── */
function paintNote(ctx: Ctx, S: number) {
  const x0 = S * 0.18, x1 = S * 0.82, y0 = S * 0.12, y1 = S * 0.88;
  const foldX = x1 - S * 0.16, foldY = y0 + S * 0.14;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      /* folded corner triangle is empty sheet */
      if (x > foldX && y < foldY && (x - foldX) + (y - y0) * 1.4 < (foldX - x0) * 0.9) continue;
      let col = shade(P.parch, x, y, S, 0.36);
      const edge = x <= x0 + 1 || x >= x1 - 1 || y <= y0 + 1 || y >= y1 - 1;
      /* fold edge line */
      const onFold = Math.abs((x - foldX) + (y - y0) * 1.4 - (foldX - x0) * 0.9) < 1.4;
      if (edge || onFold) { px(ctx, x, y, 1, shade(P.ink, x, y, S, 0.12)); continue; }
      /* fold flap shade */
      if (x > foldX && y < foldY) col = mixCss(col, P.gold, 0.3);
      /* three text lines */
      const lines = [0.34, 0.48, 0.62];
      for (let li = 0; li < lines.length; li++) {
        const ly = y0 + (y1 - y0) * lines[li];
        if (Math.abs(y - ly) < S * 0.012 && x > x0 + (x1 - x0) * 0.1 && x < x1 - (x1 - x0) * (li === 2 ? 0.3 : 0.06)) {
          col = shade(li === 1 ? P.jade : P.moss, x, y, S, 0.45);
        }
      }
      /* terracotta ink blot bottom-right */
      const bdx = x - (x1 - S * 0.09), bdy = y - (y1 - S * 0.07);
      if (bdx * bdx + bdy * bdy < (S * 0.035) * (S * 0.035)) col = shade(P.terra, x, y, S, 0.3);
      px(ctx, x, y, 1, col);
    }
  }
}

/* ── margin — the Stacks' study sheet: a parchment page ruled with a
   vertical margin line, three jade text lines on the left, and
   terracotta marginalia strokes down the right rail. ── */
function paintMargin(ctx: Ctx, S: number) {
  const x0 = S * 0.14, x1 = S * 0.88, y0 = S * 0.1, y1 = S * 0.9;
  const railX = x0 + (x1 - x0) * 0.32;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      let col = shade(P.parch, x, y, S, 0.34);
      const edge = x <= x0 + 1 || x >= x1 - 1 || y <= y0 + 1 || y >= y1 - 1;
      /* margin rail */
      if (Math.abs(x - railX) < 0.8) { px(ctx, x, y, 1, shade(P.terra, x, y, S, 0.4)); continue; }
      if (edge) { px(ctx, x, y, 1, shade(P.ink, x, y, S, 0.12)); continue; }
      /* three text lines left of the rail */
      const lines = [0.36, 0.52, 0.68];
      for (const ly of lines) {
        const yy = y0 + (y1 - y0) * ly;
        if (Math.abs(y - yy) < S * 0.011 && x > x0 + (x1 - x0) * 0.05 && x < railX - (x1 - x0) * 0.05) {
          col = shade(P.jade, x, y, S, 0.42);
        }
      }
      /* marginalia: short annotation dashes + a small underline mark */
      const mx = railX + (x1 - railX) * 0.5;
      const wob = Math.round(Math.sin(y * 0.55) * S * 0.008);
      const dashYs = [0.3, 0.42, 0.56, 0.7];
      for (const dy of dashYs) {
        const yy = y0 + (y1 - y0) * dy;
        if (Math.abs(y - yy) < S * 0.009 && x > mx - S * 0.05 + wob && x < mx + S * 0.05 + wob) {
          col = shade(P.terra, x, y, S, 0.38);
        }
      }
      px(ctx, x, y, 1, col);
    }
  }
}

export const MOSAIC_OBJECTS = ['globe', 'compass', 'books', 'cards', 'hourglass', 'ledger', 'wave', 'grid', 'box', 'note', 'margin'] as const;
export type MosaicObjectName = (typeof MOSAIC_OBJECTS)[number];

const PAINTERS: Record<Exclude<MosaicObjectName, 'globe'>, (ctx: Ctx, S: number) => void> = {
  compass: paintCompass,
  books: paintBooks,
  cards: paintCards,
  hourglass: paintHourglass,
  ledger: paintLedger,
  wave: paintWave,
  grid: paintGrid,
  box: paintBox,
  note: paintNote,
  margin: paintMargin,
};

export function paintMosaicObject(ctx: Ctx, name: Exclude<MosaicObjectName, 'globe'>, S: number) {
  PAINTERS[name](ctx, S);
}
