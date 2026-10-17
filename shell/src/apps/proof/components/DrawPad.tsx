import { useRef, useState, useCallback, useEffect } from 'react';
import type { DrawPath } from '../lib/types';
import { Eraser, PenLine, Undo2 } from 'lucide-react';

/**
 * Freehand drawing pad — an SVG scratch area for diagrams, free-body
 * sketches, geometry marks. Strokes persist as path data on the work step.
 * Pointer events; capture starts on first real move so clicks aren't eaten.
 */
export function DrawPad({
  paths,
  onChange,
  height = 220,
  readOnly = false,
}: {
  paths: DrawPath[];
  onChange?: (paths: DrawPath[]) => void;
  height?: number;
  readOnly?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const drawingRef = useRef<{ pts: [number, number][] } | null>(null);
  const [w, setW] = useState(2.2);
  const [size, setSize] = useState({ w: 600, h: height });

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0) setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toLocal = useCallback((e: React.PointerEvent): [number, number] => {
    const r = svgRef.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(r.width, e.clientX - r.left));
    const y = Math.max(0, Math.min(r.height, e.clientY - r.top));
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  }, []);

  const onDown = (e: React.PointerEvent) => {
    if (readOnly || e.button !== 0) return;
    drawingRef.current = { pts: [toLocal(e)] };
    // capture on first real move, not pointerdown — see ink pointer-capture trap
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drawingRef.current;
    if (!d) return;
    if (!svgRef.current!.hasPointerCapture(e.pointerId)) {
      try { svgRef.current!.setPointerCapture(e.pointerId); } catch { /* noop */ }
    }
    const p = toLocal(e);
    const last = d.pts[d.pts.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 1.5) return;
    d.pts.push(p);
    setCurrent(pathFrom(d.pts));
  };
  const finish = () => {
    const d = drawingRef.current;
    drawingRef.current = null;
    setCurrent(null);
    if (!d || d.pts.length < 2) return;
    onChange?.([...paths, { d: pathFrom(d.pts), w }]);
  };

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        className="drawpad w-full"
        style={{ height }}
        viewBox={`0 0 ${size.w} ${size.h}`}
        preserveAspectRatio="none"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={finish}
        onPointerCancel={() => { drawingRef.current = null; setCurrent(null); }}
        role="img"
        aria-label={readOnly ? 'Hand-drawn work' : 'Drawing pad — drag to draw'}
      >
        {paths.map((p, i) => (
          <path key={i} d={p.d} fill="none" stroke="var(--color-ink)" strokeWidth={p.w} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        ))}
        {current && (
          <path d={current} fill="none" stroke="var(--color-blueprint)" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {!readOnly && (
        <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded bg-[var(--color-film)] p-0.5 shadow-sm">
          <button
            type="button"
            className="xbtn !h-6 !w-6"
            title="Undo last stroke"
            aria-label="Undo last stroke"
            onClick={() => onChange?.(paths.slice(0, -1))}
            disabled={!paths.length}
          >
            <Undo2 size={13} />
          </button>
          <button
            type="button"
            className="xbtn !h-6 !w-6"
            title="Clear drawing"
            aria-label="Clear drawing"
            onClick={() => onChange?.([])}
            disabled={!paths.length}
          >
            <Eraser size={13} />
          </button>
          <span className="mx-1 h-4 w-px bg-[var(--color-rule-dark)]" />
          {[1.4, 2.2, 3.4].map((x) => (
            <button
              key={x}
              type="button"
              className="xbtn !h-6 !w-6"
              title={`Pen width ${x}`}
              aria-label={`Pen width ${x}`}
              aria-pressed={w === x}
              onClick={() => setW(x)}
            >
              <PenLine size={13} strokeWidth={x} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function pathFrom(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q ${pts[i][0]} ${pts[i][1]} ${mx} ${my}`;
  }
  const l = pts[pts.length - 1];
  d += ` L ${l[0]} ${l[1]}`;
  return d;
}
