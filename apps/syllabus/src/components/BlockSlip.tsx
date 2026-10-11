import { useEffect, useRef, useState } from 'react';
import type { Commitment, Course, WorkBlock } from '../lib/types';
import { courseColorVar, courseColorRgb } from '../lib/colors';
import { fmtMinutes, fmtTime12, stampDate, cn } from '../lib/utils';
import { Stamp } from './Stamp';
import { Play, Check, CalendarClock, Pin, ChevronRight, Undo2 } from 'lucide-react';

interface BlockSlipProps {
  block: WorkBlock;
  commitment?: Commitment;
  course?: Course;
  selected?: boolean;
  showDate?: boolean;
  onSelect?: () => void;
  onStart?: () => void;
  onDone?: () => void;
  onDefer?: () => void;
  onInspect?: () => void;
  onUnstamp?: () => void;
}

/**
 * A planning slip — one work block on the folio. Perforated left edge, course
 * color tab only as a spine sliver, mono times, reason line underneath.
 */
export function BlockSlip({
  block,
  commitment,
  course,
  selected,
  showDate,
  onSelect,
  onStart,
  onDone,
  onDefer,
  onInspect,
  onUnstamp,
}: BlockSlipProps) {
  const [stamped, setStamped] = useState(false);
  const done = block.state === 'done';

  // The rubber stamp lands once — whether done was stamped by the ✓ button or
  // the keyboard — by watching the transition rather than the click.
  const wasDone = useRef(done);
  useEffect(() => {
    if (done && !wasDone.current) setStamped(true);
    wasDone.current = done;
  }, [done]);
  const late =
    commitment && commitment.status === 'open' && commitment.dueAt.slice(0, 10) < block.plannedDate;
  const missed = block.state === 'missed' || block.state === 'deferred';

  return (
    <article
      className={cn(
        'slip group flex items-stretch pl-6 pr-2 py-2.5 transition-shadow',
        selected && 'ring-2 ring-[rgb(var(--ink-rgb)/0.35)]',
        done && 'opacity-75',
      )}
      onClick={onSelect}
      data-block={block.id}
    >
      {/* course sliver */}
      <span
        className="absolute left-0 top-0 bottom-0 w-[6px]"
        style={{ background: course ? courseColorVar(course.color) : 'var(--color-rule-dark)' }}
        aria-hidden
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="mono text-[11.5px] font-semibold tracking-wide text-[color:var(--color-ink)]">
            {showDate ? `${stampDate(block.plannedDate)} ` : ''}
            {fmtTime12(block.plannedStart)}
          </span>
          <span className="mono text-[10px] text-[color:var(--color-ink-faint)]">
            {fmtMinutes(block.plannedMinutes)}
          </span>
          {block.phase !== 'work' && (
            <span className="kicker !text-[9px]">{block.phase}</span>
          )}
          {block.carriedFrom && (
            <span className="mono text-[9.5px] text-[color:var(--color-late)]">
              carried from {stampDate(block.carriedFrom)}
            </span>
          )}
          {commitment?.pinned && <Pin size={11} className="text-[color:var(--color-ink-soft)]" aria-label="Pinned" />}
        </div>

        <button
          className="slab text-[15px] font-medium leading-snug text-left hover:underline decoration-1 underline-offset-2"
          onClick={(e) => {
            e.stopPropagation();
            onInspect?.();
          }}
        >
          {course ? `${course.code} — ` : ''}
          {commitment?.title ?? 'Untitled'}
        </button>

        {block.reasons.length > 0 && (
          <p className={cn('text-[11.5px] mt-0.5', late || missed ? 'text-[color:var(--color-late)]' : 'text-[color:var(--color-ink-soft)]')}>
            {block.reasons[0]}
          </p>
        )}
      </div>

      {/* actions */}
      <div className="flex items-center gap-1 pl-2 shrink-0" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <>
            <Stamp text={`DONE${block.actualMinutes ? ` ${fmtMinutes(block.actualMinutes)}` : ''}`} tone="ok" animate={stamped} />
            {onUnstamp && (
              <button className="xbtn opacity-0 group-hover:opacity-100" onClick={onUnstamp} title="Un-stamp" aria-label="Un-stamp block">
                <Undo2 size={14} />
              </button>
            )}
          </>
        ) : (
          <>
            {onStart && (
              <button
                className="btn !py-1.5 !px-3 inline-flex items-center gap-1.5"
                onClick={onStart}
                title="Start this block in Timer"
              >
                <Play size={12} /> Start
              </button>
            )}
            {onDone && (
              <button className="xbtn" onClick={() => { setStamped(true); onDone(); }} title="Stamp done" aria-label="Mark done">
                <Check size={15} />
              </button>
            )}
            {onDefer && (
              <button className="xbtn" onClick={onDefer} title="Defer / reschedule" aria-label="Defer block">
                <CalendarClock size={15} />
              </button>
            )}
            {onInspect && (
              <button className="xbtn" onClick={onInspect} title="Open commitment" aria-label="Open commitment">
                <ChevronRight size={15} />
              </button>
            )}
          </>
        )}
      </div>

      {/* course tint wash at very low alpha — paper through ink */}
      {course && (
        <span
          className="absolute inset-0 pointer-events-none"
          style={{ background: `rgb(${courseColorRgb(course.color)} / 0.045)` }}
          aria-hidden
        />
      )}
    </article>
  );
}
