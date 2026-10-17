import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store';
import { getNoteIndex } from '../../lib/notes';
import { blotPath, hashOf } from '../../lib/ink-shapes';
import { PenRest } from '../../lib/ink';
import { penOf, type PenId } from '../../lib/pens';
import { Minus, Plus, Scan } from 'lucide-react';

type NodeKind = 'page' | 'daily' | 'ghost';

interface WebNode {
  id: string;
  label: string;
  words: number;
  kind: NodeKind;
  pinned: boolean;
  ink?: PenId;
  x: number; y: number; vx: number; vy: number;
}

interface WebEdge {
  a: number;
  b: number;
  ghost: boolean;
}

interface Cam { x: number; y: number; k: number }

/** A vein: a ribbon that tapers as it runs from blot to blot. */
const veinPath = (ax: number, ay: number, bx: number, by: number, bowSign: number): string => {
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  let nx = -(by - ay);
  let ny = bx - ax;
  const len = Math.max(1, Math.hypot(nx, ny));
  nx /= len; ny /= len;
  const bow = bowSign * len * 0.07;
  const cx = mx + nx * bow;
  const cy = my + ny * bow;
  const w1 = 1.5, w2 = 0.55;
  return `M ${ax + nx * w1} ${ay + ny * w1} Q ${cx + nx * w1 * 0.7} ${cy + ny * w1 * 0.7} ${bx + nx * w2} ${by + ny * w2} L ${bx - nx * w2} ${by - ny * w2} Q ${cx - nx * w1 * 0.7} ${cy - ny * w1 * 0.7} ${ax - nx * w1} ${ay - ny * w1} Z`;
};

/** The vein's centreline — drawn dashed for veins that run to unwritten pages. */
const veinCenter = (ax: number, ay: number, bx: number, by: number, bowSign: number): string => {
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  let nx = -(by - ay);
  let ny = bx - ax;
  const len = Math.max(1, Math.hypot(nx, ny));
  nx /= len; ny /= len;
  const bow = bowSign * len * 0.07;
  return `M ${ax} ${ay} Q ${mx + nx * bow} ${my + ny * bow} ${bx} ${by}`;
};

/** Small hand-rolled force layout — repulsion, springs on edges, pull to center.
 *  Iterations scale down as the library grows so a fat desk stays snappy. */
const settle = (nodes: WebNode[], edges: WebEdge[]) => {
  const iterations = nodes.length > 120 ? 150 : nodes.length > 50 ? 260 : 340;
  const radius = 160 + nodes.length * 14;
  nodes.forEach((n, i) => {
    const angle = (i / nodes.length) * Math.PI * 2 + hashOf(n.id) * 0.9;
    n.x = Math.cos(angle) * radius * (0.55 + hashOf(n.id + 'x') * 0.45);
    n.y = Math.sin(angle) * radius * (0.55 + hashOf(n.id + 'y') * 0.45);
    n.vx = 0; n.vy = 0;
  });
  const rest = 150;
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        let dx = nodes[j].x - nodes[i].x;
        let dy = nodes[j].y - nodes[i].y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = hashOf(nodes[i].id + 'j') - 0.5; dy = hashOf(nodes[j].id + 'j') - 0.5; d2 = 0.5; }
        const d = Math.sqrt(d2);
        const f = Math.min(5, (70 * 70) / d2 * 2.4);
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        nodes[i].vx -= fx; nodes[i].vy -= fy;
        nodes[j].vx += fx; nodes[j].vy += fy;
      }
    }
    for (const e of edges) {
      const a = nodes[e.a];
      const b = nodes[e.b];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const f = (d - rest) * 0.045;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
    }
    for (const n of nodes) {
      n.vx += -n.x * 0.012;
      n.vy += -n.y * 0.012;
      n.vx *= 0.82; n.vy *= 0.82;
      n.x += Math.max(-8, Math.min(8, n.vx));
      n.y += Math.max(-8, Math.min(8, n.vy));
    }
  }
};

const blotRadius = (node: WebNode) =>
  node.kind === 'ghost' ? 4.5 : 6.5 + Math.min(9, Math.sqrt(Math.max(0, node.words)) * 0.85);

export const InkWeb: React.FC = () => {
  const { notes, setActiveNote, addNote } = useStore();
  const [hovered, setHovered] = useState<string | null>(null);
  const [cam, setCam] = useState<Cam>({ x: 0, y: 0, k: 1 });
  const [dragging, setDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const navigate = useNavigate();

  const graph = useMemo(() => {
    const live = notes.filter(n => !n.trashedAt);
    const nodes: WebNode[] = live.map(n => ({
      id: n.id,
      label: n.title || 'Untitled',
      words: n.wordCount,
      kind: n.dailyKey ? 'daily' : 'page',
      pinned: n.isPinned,
      ink: n.ink,
      x: 0, y: 0, vx: 0, vy: 0,
    }));
    const byTitle = new Map<string, number>();
    nodes.forEach((n, i) => byTitle.set(n.label.trim().toLowerCase(), i));
    const index = getNoteIndex(notes);

    const edges: WebEdge[] = [];
    const seen = new Set<string>();
    const ghosts = new Map<string, number>();
    live.forEach((note, i) => {
      for (const target of index.get(note.id)?.links ?? []) {
        const titleKey = target.toLowerCase();
        let j = byTitle.get(titleKey);
        if (j === undefined) {
          if (!ghosts.has(titleKey)) {
            ghosts.set(titleKey, nodes.length);
            nodes.push({
              id: `ghost:${titleKey}`,
              label: target,
              words: 0,
              kind: 'ghost',
              pinned: false,
              x: 0, y: 0, vx: 0, vy: 0,
            });
          }
          j = ghosts.get(titleKey)!;
        }
        if (j === i) continue;
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ a: i, b: j, ghost: nodes[j].kind === 'ghost' || nodes[i].kind === 'ghost' });
      }
    });

    if (nodes.length === 0) return { nodes, edges, vb: { x: 0, y: 0, w: 1, h: 1 } };
    settle(nodes, edges);

    const pad = 90;
    const xs = nodes.map(n => n.x);
    const ys = nodes.map(n => n.y);
    const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad - 14, maxY = Math.max(...ys) + pad + 20;
    return { nodes, edges, vb: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } };
  }, [notes]);
  const { nodes, edges, vb } = graph;

  const neighbours = useMemo(() => {
    if (!hovered) return null;
    const idx = nodes.findIndex(n => n.id === hovered);
    // The hovered page may have left the web (trashed, unlinked) — a stale
    // id must not dim the whole sheet.
    if (idx < 0) return null;
    const set = new Set<number>([idx]);
    edges.forEach(e => {
      if (e.a === idx) set.add(e.b);
      if (e.b === idx) set.add(e.a);
    });
    return set;
  }, [hovered, nodes, edges]);

  // Pan/zoom — the sheet is bigger than the window; drag it around, wheel to lean in.
  const vbScale = () => {
    const svg = svgRef.current;
    if (!svg) return 1;
    const rect = svg.getBoundingClientRect();
    return Math.min(rect.width / vb.w, rect.height / vb.h) || 1;
  };

  const toWorld = (clientX: number, clientY: number) => {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const s = vbScale();
    const ox = (rect.width - vb.w * s) / 2;
    const oy = (rect.height - vb.h * s) / 2;
    return {
      x: (clientX - rect.left - ox) / s + vb.x,
      y: (clientY - rect.top - oy) / s + vb.y,
    };
  };

  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    setCam(c => {
      const k2 = Math.min(5, Math.max(0.3, c.k * factor));
      const p = toWorld(clientX, clientY);
      // The point under the cursor in *world* space — keep it pinned as k
      // changes: displayed = c + k·world  =>  c' = c + (k - k')·world.
      const wx = (p.x - c.x) / c.k;
      const wy = (p.y - c.y) / c.k;
      return { k: k2, x: c.x + (c.k - k2) * wx, y: c.y + (c.k - k2) * wy };
    });
  };

  const onWheel = (e: React.WheelEvent) => {
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0013));
  };

  // Touch: track every pointer so a second finger turns the drag into a pinch.
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; k: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      // Second finger down — the gesture is now a pinch, not a pan.
      dragRef.current = null;
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = { dist: Math.hypot(b.x - a.x, b.y - a.y), k: cam.k };
      for (const id of pointersRef.current.keys()) {
        try { (e.currentTarget as Element).setPointerCapture(id); } catch { /* finger may already be up */ }
      }
      setDragging(true);
      return;
    }
    // No pointer capture yet — capturing at down retargets the click to the
    // svg and blots never see it. Capture once a real drag begins.
    dragRef.current = { x: e.clientX, y: e.clientY, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    const pinch = pinchRef.current;
    if (pinch && pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (dist <= 0 || pinch.dist <= 0) return;
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      setCam(c => {
        const k2 = Math.min(5, Math.max(0.3, pinch.k * (dist / pinch.dist)));
        const p = toWorld(midX, midY);
        const wx = (p.x - c.x) / c.k;
        const wy = (p.y - c.y) / c.k;
        return { k: k2, x: c.x + (c.k - k2) * wx, y: c.y + (c.k - k2) * wy };
      });
      return;
    }
    const d = dragRef.current;
    if (!d) return;
    if (e.buttons === 0) {
      // The button went up outside the svg before a drag began — drop it.
      dragRef.current = null;
      return;
    }
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    d.moved = true;
    setDragging(true);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    d.x = e.clientX;
    d.y = e.clientY;
    const s = vbScale();
    setCam(c => ({ ...c, x: c.x + dx / s, y: c.y + dy / s }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pinchRef.current && pointersRef.current.size < 2) {
      // Pinch ended — swallow the click the lifting finger might fire, and
      // don't let the remaining finger resume mid-pan from a stale origin.
      pinchRef.current = null;
      suppressClickRef.current = true;
      dragRef.current = null;
      setDragging(false);
      return;
    }
    // A real pan ends with a click on whatever blot the cursor stopped on —
    // swallow it so releasing a drag doesn't open the page underneath.
    if (dragRef.current?.moved) suppressClickRef.current = true;
    dragRef.current = null;
    setDragging(false);
  };
  const zoomCenter = (factor: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
  };

  const openNode = (node: WebNode) => {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    if (node.kind === 'ghost') {
      addNote({ title: node.label });
    } else {
      setActiveNote(node.id);
    }
    navigate('/');
  };

  const linkCount = edges.length;
  const ghostCount = nodes.filter(n => n.kind === 'ghost').length;
  // Labels: always show them on small webs; on busy ones they surface
  // on hover (and always when leaned in past a zoom threshold).
  const labelsOn = nodes.length <= 60 || cam.k > 1.55;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-desk">
      <div className="px-6 md:px-10 pt-10 md:pt-14 pb-4 flex-shrink-0">
        <h1 className="font-serif text-3xl font-semibold text-ink tracking-tight">The ink web</h1>
        <p className="text-sm text-ink-faint mt-1.5 max-w-lg">
          Pages that name each other, drawn vein to blot. Blot size follows word count; dashed circles are pages referenced but not yet written — click one to begin it. Drag to wander, pinch or scroll to lean in.
        </p>
      </div>

      <div className="flex-1 overflow-hidden px-6 md:px-10 pb-6">
        {nodes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
            <PenRest className="w-28 h-14 mb-1 opacity-80" />
            <p className="font-serif text-lg text-ink-ghost">A clean sheet. Nothing woven yet.</p>
            <p className="font-mono text-2xs text-ink-ghost">link notes with [[their titles]] and veins appear</p>
          </div>
        ) : (
          <div className="relative h-full bg-paper border border-line rounded sheet paper-grain overflow-hidden">
            <svg
              ref={svgRef}
              viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
              className="w-full h-full touch-none"
              role="img"
              aria-label={`Ink web — ${nodes.length - ghostCount} pages, ${linkCount} links`}
              onWheel={onWheel}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              /* An uncaptured pointer that slips off the sheet may release
               * outside and never send pointerup here — drop it from the
               * finger count so the next touch isn't read as a phantom
               * pinch. But leave dragRef alone: a drag that starts at the
               * sheet's edge legitimately leaves the svg before its first
               * real move earns pointer capture, and killing it here would
               * freeze edge-started pans again. */
              onPointerLeave={(e) => pointersRef.current.delete(e.pointerId)}
              onLostPointerCapture={onPointerUp}
              onClick={() => { suppressClickRef.current = false; }}
              style={{ cursor: dragging ? 'grabbing' : 'grab' }}
            >
              <g transform={`translate(${cam.x} ${cam.y}) scale(${cam.k})`}>
                {/* veins — ribbons of ink that taper as they run */}
                {edges.map((e, i) => {
                  const a = nodes[e.a];
                  const b = nodes[e.b];
                  const lit = hovered && (a.id === hovered || b.id === hovered);
                  // A vein toward an unwritten page runs in the pen that
                  // named it — the writer's own ink, still wet on the map.
                  const veinInk = e.ghost ? penOf(a.ink).color : 'var(--color-ink-ghost)';
                  return (
                    <g key={i}>
                      <path
                        d={veinPath(a.x, a.y, b.x, b.y, i % 2 === 0 ? 1 : -1)}
                        fill={lit ? 'var(--color-pencil)' : veinInk}
                        fillOpacity={hovered && !lit ? 0.12 : lit ? 0.85 : e.ghost ? 0.28 : 0.4}
                        style={{ transition: 'fill-opacity .15s, fill .15s' }}
                      />
                      {e.ghost && (
                        <path
                          d={veinCenter(a.x, a.y, b.x, b.y, i % 2 === 0 ? 1 : -1)}
                          fill="none"
                          stroke={lit ? 'var(--color-pencil)' : penOf(a.ink).color}
                          strokeWidth={1.1}
                          strokeDasharray="4 5"
                          strokeLinecap="round"
                          vectorEffect="non-scaling-stroke"
                          opacity={hovered && !lit ? 0.15 : 0.7}
                        />
                      )}
                    </g>
                  );
                })}
                {/* blots — every page is its own stain, seeded by id */}
                {nodes.map((node, i) => {
                  const r = blotRadius(node);
                  const dimmed = neighbours ? !neighbours.has(i) : false;
                  const seed = hashOf(node.id);
                  const showLabel = labelsOn || hovered === node.id || (neighbours?.has(i) ?? false);
                  return (
                    <g
                      key={node.id}
                      onClick={() => openNode(node)}
                      onMouseEnter={() => setHovered(node.id)}
                      onMouseLeave={() => setHovered(null)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openNode(node); } }}
                      className="cursor-pointer outline-none"
                      opacity={dimmed ? 0.22 : 1}
                      style={{ transition: 'opacity .15s' }}
                      aria-label={`${node.label}${node.kind === 'ghost' ? ' — unwritten page' : ''}`}
                    >
                      <g transform={`translate(${node.x} ${node.y})`}>
                        {node.kind === 'ghost' ? (
                          <path
                            d={blotPath(node.id, r * 4)}
                            transform="scale(0.25)"
                            fill="none"
                            stroke="var(--color-ink-ghost)"
                            strokeWidth={4}
                            strokeDasharray="10 10"
                            vectorEffect="non-scaling-stroke"
                            strokeDashoffset={0}
                          />
                        ) : (
                          <path
                            d={blotPath(node.id, r * 4)}
                            transform="scale(0.25)"
                            fill={node.ink ? penOf(node.ink).color : node.kind === 'daily' ? 'var(--color-fountain)' : 'var(--color-ink)'}
                            fillOpacity={node.kind === 'daily' ? 0.9 : 0.82}
                            stroke={node.pinned ? 'var(--color-pencil)' : 'none'}
                            strokeWidth={node.pinned ? 5 : 0}
                            vectorEffect="non-scaling-stroke"
                          />
                        )}
                        {/* a fleck flung from the same nib */}
                        {node.kind !== 'ghost' && (
                          <circle
                            cx={r * 1.7 + seed * 5}
                            cy={-r * 1.15}
                            r={1.3 + seed * 1.4}
                            fill={node.ink ? penOf(node.ink).color : node.kind === 'daily' ? 'var(--color-fountain)' : 'var(--color-ink)'}
                            fillOpacity={0.5}
                          />
                        )}
                      </g>
                      {showLabel && (
                        <text
                          x={node.x}
                          y={node.y + r + 13}
                          textAnchor="middle"
                          className="font-serif"
                          fontSize="11"
                          fontStyle={node.kind === 'ghost' ? 'italic' : 'normal'}
                          fill={hovered === node.id ? 'var(--color-ink)' : 'var(--color-ink-soft)'}
                          opacity={dimmed ? 0.3 : 0.9}
                        >
                          {node.label.length > 24 ? `${node.label.slice(0, 23)}…` : node.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>

            {/* zoom tools */}
            <div className="absolute top-3 left-4 flex flex-col gap-1">
              <button
                onClick={() => zoomCenter(1.3)}
                aria-label="Lean in"
                title="Lean in"
                className="w-7 h-7 flex items-center justify-center bg-paper border border-line rounded text-ink-faint hover:text-ink transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={2} />
              </button>
              <button
                onClick={() => zoomCenter(1 / 1.3)}
                aria-label="Step back"
                title="Step back"
                className="w-7 h-7 flex items-center justify-center bg-paper border border-line rounded text-ink-faint hover:text-ink transition-colors shadow-sm"
              >
                <Minus className="w-3.5 h-3.5" strokeWidth={2} />
              </button>
              <button
                onClick={() => setCam({ x: 0, y: 0, k: 1 })}
                aria-label="Refit the sheet"
                title="Refit the sheet"
                className="w-7 h-7 flex items-center justify-center bg-paper border border-line rounded text-ink-faint hover:text-ink transition-colors shadow-sm"
              >
                <Scan className="w-3.5 h-3.5" strokeWidth={1.75} />
              </button>
            </div>

            {/* legend */}
            <div className="absolute bottom-3 left-4 flex items-center gap-4 font-mono text-2xs text-ink-ghost select-none">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-ink inline-block" /> page</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-fountain inline-block" /> journal</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full border-2 border-pencil inline-block" /> pinned</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full border border-dashed border-ink-ghost inline-block" /> unwritten</span>
            </div>
            <p className="absolute top-3 right-4 font-mono text-2xs text-ink-ghost tabular-nums">
              {nodes.length - ghostCount} pages · {linkCount} {linkCount === 1 ? 'vein' : 'veins'}{ghostCount > 0 ? ` · ${ghostCount} unwritten` : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
