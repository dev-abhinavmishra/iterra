import { useEffect, useRef } from 'react';
import { paintMosaicObject, type MosaicObjectName } from './mosaicObjects';

/* MosaicObject — renders one of the procedural pixel-mosaic objects
   (compass, books, …) onto a canvas, then keeps it alive: a slow
   specular glint sweeps the medallion while individual tesserae
   twinkle on and off like worked glass catching light. Hovering
   quickens the sweep and brightens the sparkle field. CSS upscales
   the canvas pixelated so every cell reads as a single tessera.
   'globe' is handled by the caller (MosaicGlobe sprite frames). */

interface Spark {
  x: number;
  y: number;
  phase: number;
  speed: number;
  size: number;
}

/* deterministic PRNG so the sparkle field is stable per object */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function MosaicObject({
  name,
  className,
  size = 40,
}: {
  name: Exclude<MosaicObjectName, 'globe'>;
  className?: string;
  size?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const hoverRef = useRef(false);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    /* paint once into an offscreen base — every frame composites over it */
    const base = document.createElement('canvas');
    base.width = base.height = size;
    const bctx = base.getContext('2d');
    if (!bctx) {
      ctx.clearRect(0, 0, size, size);
      paintMosaicObject(ctx, name, size);
      return;
    }
    paintMosaicObject(bctx, name, size);

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      ctx.drawImage(base, 0, 0);
      return;
    }

    /* collect the painted cells — sparkles only land on real tesserae,
       never on the empty corners of the medallion */
    const img = bctx.getImageData(0, 0, size, size).data;
    const cells: Array<[number, number]> = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        if (img[i + 3] > 120) cells.push([x, y]);
      }
    }
    const rand = mulberry32(name.length * 7919 + size);
    const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

    const sparks: Spark[] = Array.from({ length: 26 }, () => {
      const [x, y] = pick(cells);
      return {
        x,
        y,
        phase: rand() * Math.PI * 2,
        speed: 0.6 + rand() * 1.6,
        size: rand() < 0.25 ? 2 : 1,
      };
    });

    const SWEEP_IDLE = 4600;
    const SWEEP_HOVER = 1500;
    let raf = 0;

    const draw = (t: number) => {
      const hovered = hoverRef.current;
      const period = hovered ? SWEEP_HOVER : SWEEP_IDLE;
      const p = (t % period) / period;

      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(base, 0, 0);

      /* 1 — specular glint band travelling across the medallion.
         Hover flies it through in a third of the time. */
      const band = size * 0.6;
      const cx = -band + (size + band * 2) * p;
      const g = ctx.createLinearGradient(cx - band / 2, 0, cx + band / 2, size * 0.6);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, `rgba(255,246,214,${hovered ? 0.6 : 0.42})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);

      /* 2 — tessera twinkles: individual cells flash warm gold on their
         own slow rhythms; hover roughly doubles the lit count */
      const active = hovered ? sparks.length : Math.ceil(sparks.length * 0.55);
      for (let i = 0; i < active; i++) {
        const s = sparks[i];
        /* sharper pulse — long dark gaps, brief bright catches */
        const a = Math.pow(Math.max(0, Math.sin(t * 0.001 * s.speed + s.phase)), 10);
        if (a < 0.03) continue;
        ctx.globalAlpha = a * (hovered ? 0.95 : 0.7);
        ctx.fillStyle = i % 3 === 0 ? '#fff8dd' : '#e8c86a';
        ctx.fillRect(s.x, s.y, s.size, s.size);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const onEnter = () => { hoverRef.current = true; };
    const onLeave = () => { hoverRef.current = false; };
    c.addEventListener('pointerenter', onEnter);
    c.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      c.removeEventListener('pointerenter', onEnter);
      c.removeEventListener('pointerleave', onLeave);
    };
  }, [name, size]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
