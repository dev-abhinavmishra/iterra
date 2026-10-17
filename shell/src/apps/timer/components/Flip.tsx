import React, { useEffect, useRef, useState } from 'react';
import { flapTick, flapLand } from '../lib/sound';
import { cn } from '../lib/utils';

/* ------------------------------------------------------------------ */
/* Split-flap primitives                                                */
/*                                                                     */
/* A flap is a card folded at a horizontal hinge: the static top half   */
/* already shows the incoming glyph while a leaf carrying the old glyph */
/* folds down over the hinge; a second leaf carrying the new glyph then */
/* drops into place with a small overshoot.                             */
/* ------------------------------------------------------------------ */

let lastTickAt = 0;
let lastLandAt = 0;
function tickSound() {
  const now = performance.now();
  if (now - lastTickAt > 28) { lastTickAt = now; flapTick(); }
}
function landSound() {
  const now = performance.now();
  if (now - lastLandAt > 28) { lastLandAt = now; flapLand(); }
}

export interface FlipDigitProps {
  char: string;                 // single character to display
  size?: number;                // glyph font-size in px
  width?: number;               // flap width px (defaults from size)
  delay?: number;               // ms before the flip begins (row cascade)
  duration?: number;            // ms for the whole flip
  accent?: boolean;             // signal-coloured flap
  quiet?: boolean;              // dimmed flap ink
  sound?: boolean;              // play relay click/thunk
  square?: boolean;             // letters look better a bit wider
  flipIn?: boolean;             // mount on the blank card, then flip to char
}

export function FlipDigit({
  char, size = 56, width, delay = 0, duration = 600,
  accent = false, quiet = false, sound = true, square = false, flipIn = false,
}: FlipDigitProps) {
  // `shown` is the committed glyph at rest; `leaf` is the card pair mid-flight,
  // carrying its own {prev → next} so a retarget never morphs a live card face.
  const [shown, setShown] = useState(flipIn ? ' ' : char);
  const [leaf, setLeaf] = useState<{ prev: string; next: string } | null>(
    flipIn ? { prev: ' ', next: char } : null,
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seed the fold during render, not in an effect: an effect-seeded leaf leaves
  // one painted frame with `char` on both static halves before the leaves exist
  // — the digit flashes the new number, snaps back, then flips. Seeded here,
  // React re-renders before paint and the flash never reaches the screen.
  if (char !== shown && leaf === null) {
    setLeaf({ prev: shown, next: char });
  }

  useEffect(() => {
    if (!leaf) return;
    if (sound) tickSound();
    // Failsafe only — the commit normally comes from the bottom leaf's
    // animationend so it fires exactly when the CSS lands, even if delay or
    // duration changed mid-flight (a boot phase change lengthens both).
    timer.current = setTimeout(() => {
      setShown(leaf.next);
      setLeaf(null);
      if (sound) landSound();
    }, delay + duration + 150);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [leaf, delay, duration, sound]);

  const fsH = size;
  const fsW = width ?? Math.round(size * (square ? 0.72 : 0.64));
  const style = {
    '--fs': `${Math.round(size * 0.78)}px`,
    '--fs-h': `${fsH}px`,
    '--fs-w': `${fsW}px`,
    '--flip-dur': `${duration}ms`,
    '--flip-delay': `${delay}ms`,
  } as React.CSSProperties;

  return (
    <div
      className={cn('flap', leaf && 'flap--flipping', accent && 'flap--accent', quiet && 'flap--quiet')}
      style={style}
      aria-label={shown}
    >
      {/* During a flip the static halves show THIS leaf's pair — the top reveals
          leaf.next only as the folding leaf uncovers it, the bottom holds leaf.prev
          until the new card lands. Retargets mid-flight keep the old pair and
          chain a fresh flip on landing instead of swapping a live card face. */}
      <div className="flap-half flap-half--top"><span className="flap-glyph">{leaf ? leaf.next : char}</span></div>
      <div className="flap-half flap-half--bot"><span className="flap-glyph">{leaf ? leaf.prev : char}</span></div>
      {/* Keyed per pair: a chained flip replaces these nodes outright so the
          leaf animations restart — reusing them would leave the finished
          animations at their end-state and the new digit would teleport. Two
          adjacent leaves can never share a pair (prev of one is next of the
          last), so prev+next is a safe key. */}
      {leaf && (
        <React.Fragment key={leaf.prev + leaf.next}>
          <div className="flap-leaf flap-leaf--top">
            <span className="flap-glyph">{leaf.prev}</span>
            <i className="flap-shade" />
          </div>
          <div
            className="flap-leaf flap-leaf--bot"
            onAnimationEnd={() => {
              setShown(leaf.next);
              setLeaf(null);
              if (sound) landSound();
            }}
          >
            <span className="flap-glyph">{leaf.next}</span>
            <i className="flap-shade" />
          </div>
          <i className="flap-shadow-bot" />
        </React.Fragment>
      )}
      <div className="flap-seam" />
    </div>
  );
}

/* Colon separator — optionally pulses once per second. */
export function FlipColon({ size = 56, live = false }: { size?: number; live?: boolean }) {
  return (
    <div
      className={cn('flap-colon', live && 'flap-colon--live')}
      style={{ '--fs-h': `${size}px` } as React.CSSProperties}
      aria-hidden
    >
      <i /><i />
    </div>
  );
}

export interface FlipRowProps {
  text: string;
  size?: number;
  delayStep?: number;      // cascade step ms, right to left
  duration?: number;
  accent?: boolean;
  quiet?: boolean;
  sound?: boolean;
  live?: boolean;          // colon heartbeat
  square?: boolean;
  flipIn?: boolean;        // start on the blank card so the row cascades in on mount
  className?: string;
}

/* A row of flaps rendering a string — ':' renders as a colon, ' ' as a gap. */
export function FlipRow({
  text, size = 56, delayStep = 42, duration = 600,
  accent = false, quiet = false, sound = true, live = false, square = false, flipIn = false,
  className,
}: FlipRowProps) {
  const chars = text.split('');
  const n = chars.length;
  return (
    <div className={cn('flex items-center', className)} style={{ gap: Math.max(2, Math.round(size * 0.05)) }}>
      {chars.map((c, i) => {
        const delay = (n - 1 - i) * delayStep;
        if (c === ':') return <FlipColon key={i} size={size} live={live} />;
        if (c === ' ') return <div key={i} style={{ width: Math.round(size * 0.3) }} />;
        return (
          <FlipDigit
            key={i}
            char={c}
            size={size}
            delay={delay}
            duration={duration}
            accent={accent}
            quiet={quiet}
            sound={sound}
            square={square}
            flipIn={flipIn}
          />
        );
      })}
    </div>
  );
}

/* Letter flaps spelling a word — used for board messages. */
export function FlipText({ text, size = 40, className, accent = false, delayStep = 55, sound = true }: {
  text: string; size?: number; className?: string; accent?: boolean; delayStep?: number; sound?: boolean;
}) {
  return (
    <FlipRow text={text.toUpperCase()} size={size} className={className} accent={accent} delayStep={delayStep} sound={sound} square flipIn />
  );
}

/* Rolling digit — a two-cell reel for values too fast to flap (centiseconds). */
export function RollDigit({ value, className }: { value: string; className?: string }) {
  const [curr, setCurr] = useState(value);
  const [prev, setPrev] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null); // target of an in-flight roll

  useEffect(() => {
    if (value === curr && pending.current === null) return;
    if (value === pending.current) return; // already rolling to this
    // roll from wherever the previous roll was heading, not the stale commit
    setPrev(pending.current !== null ? pending.current : curr);
    pending.current = value;
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => {
      pending.current = null;
      setCurr(value);
      setPrev(null);
    }, 95);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span className={cn('roll', className)}>
      <span
        className="roll-strip"
        style={prev === null ? { transition: 'none', transform: 'translateY(0)' } : { transform: 'translateY(-1em)' }}
      >
        <span>{prev ?? curr}</span>
        <span>{value}</span>
      </span>
    </span>
  );
}

/* A framed instrument housing. */
export function Board({ children, label, right, className, inset = true, screws = true }: {
  children: React.ReactNode;
  label?: string;
  right?: React.ReactNode;
  className?: string;
  inset?: boolean;
  screws?: boolean;
}) {
  return (
    <div className={cn('board', screws && 'board-screws', 'px-5 py-4 md:px-7 md:py-5', className)}>
      {(label || right) && (
        <div className="flex items-center justify-between mb-3 px-0.5">
          {/* keyed remount → the engraved title slides in when it changes */}
          <span key={label} className="engraved text-[10px] md:text-xs board-label">{label}</span>
          {right}
        </div>
      )}
      {inset ? <div className="board-inset px-4 py-4 md:px-6">{children}</div> : children}
    </div>
  );
}
