import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useFolio, selectTermCourses } from '../store';
import {
  addDaysISO,
  stampDate,
  dowName,
  fullDate,
  fmtTime12,
  fmtMinutes,
  weekStartISO,
  cn,
} from '../lib/utils';
import { courseColorVar } from '../lib/colors';
import type { ISODate } from '../lib/types';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type CalMode = 'week' | 'month' | 'agenda';

/**
 * Calendar — the temporal map. Week shows booked slips per day; month shows
 * deadline density; agenda is the narrow-screen list. Blocks can be moved by
 * drag or keyboard (select a slip, arrows move it).
 */
export function CalendarView({ onInspect, today }: { onInspect: (id: string) => void; today: ISODate }) {
  const s = useFolio();
  const courses = useFolio(useShallow(selectTermCourses));
  const [mode, setMode] = useState<CalMode>('week');
  const [anchor, setAnchor] = useState<ISODate>(today);
  const [moveBlockId, setMoveBlockId] = useState<string | null>(null);

  const courseById = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [courses]);
  const blocks = useMemo(() => Object.values(s.blocks), [s.blocks]);
  const commitments = s.commitments;

  // due-date markers (commitment → its due day)
  const dueByDate = useMemo(() => {
    const m = new Map<ISODate, { id: string; title: string; late: boolean }[]>();
    for (const c of Object.values(commitments)) {
      if (c.status !== 'open') continue;
      if (!courses.some((co) => co.id === c.courseId && !co.archived)) continue;
      const d = c.dueAt.slice(0, 10);
      const arr = m.get(d) ?? [];
      arr.push({ id: c.id, title: c.title, late: d < today });
      m.set(d, arr);
    }
    return m;
  }, [commitments, courses, today]);

  const blocksByDate = useMemo(() => {
    const m = new Map<ISODate, typeof blocks>();
    for (const b of blocks) {
      const arr = m.get(b.plannedDate) ?? [];
      arr.push(b);
      m.set(b.plannedDate, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
    return m;
  }, [blocks]);

  const weekStart = weekStartISO(anchor, s.settings.weekStartsOn);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));

  const monthAnchor = anchor.slice(0, 8) + '01';
  const monthStart = weekStartISO(monthAnchor, s.settings.weekStartsOn);
  const monthDays = Array.from({ length: 42 }, (_, i) => addDaysISO(monthStart, i));
  const inMonth = (d: ISODate) => d.slice(5, 7) === anchor.slice(5, 7);

  const moveBlockTo = (blockId: string, date: ISODate) => {
    s.rescheduleBlock(blockId, date);
    setMoveBlockId(null);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      {/* header */}
      <div className="flex items-end justify-between gap-3 mb-5 flex-wrap">
        <div>
          <div className="kicker mb-1">TEMPORAL MAP</div>
          <h1 className="slab text-[28px] font-semibold leading-none">
            {mode === 'month' ? monthName(anchor) : mode === 'week' ? `Week of ${stampDate(weekStart)}` : 'Agenda'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-[color:var(--color-rule-dark)] rounded-[3px] overflow-hidden" role="tablist" aria-label="Calendar mode">
            {(['week', 'month', 'agenda'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                className={cn(
                  'mono text-[10px] font-semibold tracking-[0.1em] uppercase px-3 py-1.5',
                  mode === m ? 'bg-[color:var(--color-ink)] text-[color:var(--color-stock)]' : 'text-[color:var(--color-ink-soft)] hover:bg-[rgb(var(--ink-rgb)/0.06)]',
                )}
                onClick={() => setMode(m)}
              >
                {m}
              </button>
            ))}
          </div>
          <button className="xbtn" onClick={() => setAnchor(addDaysISO(anchor, mode === 'month' ? -30 : -7))} aria-label="Previous">
            <ChevronLeft size={16} />
          </button>
          <button className="btn btn--ghost !py-1 !px-2.5 mono" onClick={() => setAnchor(today)}>
            now
          </button>
          <button className="xbtn" onClick={() => setAnchor(addDaysISO(anchor, mode === 'month' ? 30 : 7))} aria-label="Next">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {moveBlockId && (
        <p className="mono text-[11px] mb-3 text-[color:var(--color-ink-soft)]">
          Moving slip — click a day to re-book it. <button className="underline" onClick={() => setMoveBlockId(null)}>cancel</button>
        </p>
      )}

      {/* ── week view ── */}
      {mode === 'week' && (
        <div className="grid grid-cols-7 gap-1.5" role="grid" aria-label="Week">
          {weekDays.map((d) => {
            const dayBlocks = blocksByDate.get(d) ?? [];
            const dues = dueByDate.get(d) ?? [];
            const isToday = d === today;
            return (
              <div
                key={d}
                role="gridcell"
                className={cn('cal-cell rounded-[3px] min-h-[190px] p-1.5 flex flex-col', isToday && 'cal-today', moveBlockId && 'cursor-copy hover:bg-[rgb(var(--ink-rgb)/0.05)]')}
                onClick={() => moveBlockId && moveBlockTo(moveBlockId, d)}
              >
                <div className={cn('mono text-[9.5px] font-semibold mb-1.5 flex items-baseline justify-between', isToday ? 'text-[color:var(--color-ink)]' : 'text-[color:var(--color-ink-faint)]')}>
                  <span>{dowName(d)}</span>
                  <span className={cn(isToday && 'bg-[color:var(--color-ink)] text-[color:var(--color-stock)] rounded-[2px] px-1')}>{stampDate(d)}</span>
                </div>

                {/* due flags */}
                {dues.map((dd) => {
                  const c = commitments[dd.id];
                  const course = c ? courseById[c.courseId] : undefined;
                  return (
                    <button
                      key={dd.id}
                      onClick={(e) => { e.stopPropagation(); onInspect(dd.id); }}
                      className={cn('text-left w-full mb-1 px-1 py-0.5 rounded-[2px] border-l-[3px]', dd.late ? 'border-l-[color:var(--color-late)]' : '')}
                      style={{
                        borderLeftColor: dd.late ? undefined : course ? courseColorVar(course.color) : 'var(--color-rule-dark)',
                        background: 'rgb(var(--ink-rgb) / 0.045)',
                      }}
                      title={`Due: ${c?.title}`}
                    >
                      <span className={cn('slab text-[10.5px] font-medium leading-tight line-clamp-2', dd.late && 'text-[color:var(--color-late)]')}>
                        {dd.title}
                      </span>
                    </button>
                  );
                })}

                {/* booked slips */}
                <div className="mt-auto space-y-1">
                  {dayBlocks.map((b) => {
                    const c = commitments[b.commitmentId];
                    const course = c ? courseById[c.courseId] : undefined;
                    const stamped = b.state === 'done';
                    return (
                      <button
                        key={b.id}
                        draggable={!stamped}
                        onDragStart={(e) => {
                          if (stamped) return;
                          e.dataTransfer.setData('text/block-id', b.id);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (stamped) {
                            onInspect(b.commitmentId);
                            return;
                          }
                          if (moveBlockId === b.id) setMoveBlockId(null);
                          else setMoveBlockId(b.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!stamped) moveBlockTo(b.id, addDaysISO(b.plannedDate, e.key === 'ArrowRight' ? 1 : -1));
                          }
                        }}
                        className={cn(
                          'w-full text-left px-1.5 py-1 rounded-[2px] border border-[color:var(--color-rule)] bg-[color:var(--color-slip)] shadow-[0_1px_2px_rgb(0_0_0/0.1)] animate-[block-slide_0.45s_cubic-bezier(0.25,0.8,0.25,1)_both]',
                          !stamped && 'cursor-grab active:cursor-grabbing',
                          moveBlockId === b.id && 'ring-2 ring-[rgb(var(--ink-rgb)/0.4)]',
                          stamped && 'opacity-60',
                        )}
                        title={
                          stamped
                            ? `${b.plannedStart} · ${c?.title} — stamped; un-stamp on the desk to move`
                            : `${b.plannedStart} · ${c?.title} — drag or select then click a day; ←/→ nudges a day`
                        }
                        aria-label={
                          stamped
                            ? `${fmtTime12(b.plannedStart)} ${c?.title ?? ''} — stamped done`
                            : `${fmtTime12(b.plannedStart)} ${c?.title ?? ''}. Press left or right to move a day.`
                        }
                      >
                        <span className="block w-[14px] h-[3px] rounded-full mb-0.5" style={{ background: course ? courseColorVar(course.color) : 'var(--color-rule-dark)' }} />
                        <span className="mono text-[9px] block">{b.plannedStart} {fmtMinutes(b.plannedMinutes)}</span>
                        <span className="slab text-[11px] font-medium leading-tight line-clamp-2 block">{c?.title}</span>
                      </button>
                    );
                  })}
                </div>

                {/* drop target */}
                <div
                  className="flex-1"
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes('text/block-id')) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }
                  }}
                  onDrop={(e) => {
                    const id = e.dataTransfer.getData('text/block-id');
                    if (id) {
                      e.preventDefault();
                      moveBlockTo(id, d);
                    }
                  }}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* ── month view — deadline density ── */}
      {mode === 'month' && (
        <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Month">
          {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((d) => (
            <div key={d} className="kicker !text-[9px] text-center py-1">{d}</div>
          ))}
          {monthDays.map((d) => {
            const dues = dueByDate.get(d) ?? [];
            const dayBlocks = blocksByDate.get(d) ?? [];
            const dense = dues.length + dayBlocks.length;
            return (
              <button
                key={d}
                onClick={() => { setAnchor(d); setMode('week'); }}
                className={cn(
                  'cal-cell rounded-[3px] min-h-[74px] p-1.5 text-left align-top',
                  d === today && 'cal-today',
                  !inMonth(d) && 'opacity-40',
                )}
              >
                <span className={cn('mono text-[9.5px]', d === today ? 'font-bold' : 'text-[color:var(--color-ink-faint)]')}>
                  {stampDate(d)}
                </span>
                {dense > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {dues.slice(0, 2).map((dd) => {
                      const c = commitments[dd.id];
                      const course = c ? courseById[c.courseId] : undefined;
                      return (
                        <div key={dd.id} className="flex items-center gap-1">
                          <span className="w-[6px] h-[6px] rounded-[1px] shrink-0" style={{ background: dd.late ? 'var(--color-late)' : course ? courseColorVar(course.color) : 'var(--color-rule-dark)' }} />
                          <span className={cn('slab text-[9.5px] truncate', dd.late && 'text-[color:var(--color-late)]')}>{dd.title}</span>
                        </div>
                      );
                    })}
                    {dayBlocks.length > 0 && (
                      <span className="mono text-[8.5px] text-[color:var(--color-ink-faint)]">{dayBlocks.length} slip{dayBlocks.length === 1 ? '' : 's'}</span>
                    )}
                    {dues.length > 2 && <span className="mono text-[8.5px] text-[color:var(--color-ink-faint)]">+{dues.length - 2} due</span>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── agenda — narrow screens ── */}
      {mode === 'agenda' && (
        <ol className="space-y-4">
          {Array.from({ length: 14 }, (_, i) => addDaysISO(anchor, i)).map((d) => {
            const dues = dueByDate.get(d) ?? [];
            const dayBlocks = blocksByDate.get(d) ?? [];
            if (!dues.length && !dayBlocks.length && d !== today) return null;
            return (
              <li key={d} className="border-l-2 border-[color:var(--color-rule-dark)] pl-4">
                <div className="flex items-baseline gap-2">
                  <span className={cn('mono text-[11.5px] font-semibold', d === today && 'text-[color:var(--color-ink)]')}>
                    {fullDate(d)}
                  </span>
                  {d === today && <span className="kicker !text-[9px]">TODAY</span>}
                </div>
                <ul className="mt-1.5 space-y-1">
                  {dues.map((dd) => (
                    <li key={dd.id}>
                      <button onClick={() => onInspect(dd.id)} className={cn('slab text-[14px] font-medium hover:underline decoration-1 underline-offset-2', dd.late && 'text-[color:var(--color-late)]')}>
                        {dd.late ? 'LATE — ' : 'due — '}{dd.title}
                      </button>
                    </li>
                  ))}
                  {dayBlocks.map((b) => {
                    const c = commitments[b.commitmentId];
                    return (
                      <li key={b.id} className="text-[12.5px] text-[color:var(--color-ink-soft)]">
                        <span className="mono text-[10.5px]">{fmtTime12(b.plannedStart)} {fmtMinutes(b.plannedMinutes)}</span> — {c?.title}
                        {b.state === 'done' && ' ✓'}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function monthName(anchor: ISODate): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[Number(anchor.slice(5, 7)) - 1]} ${anchor.slice(0, 4)}`;
}
