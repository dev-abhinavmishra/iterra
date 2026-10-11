import { useMemo, useState, useRef, useEffect } from 'react';
import {
  useFolio,
  selectBlocksOnDate,
  selectMissed,
  selectTermCourses,
  type ProposedBlock,
} from '../store';
import { useShallow } from 'zustand/react/shallow';
import { planDay } from '../lib/schedule';
import { timerDeepLink } from '../lib/links';
import { BlockSlip } from '../components/BlockSlip';
import { QuickAdd } from '../components/QuickAdd';
import {
  fmtMinutes,
  stampDate,
  fullDate,
  addDaysISO,
  cn,
} from '../lib/utils';
import { courseColorVar } from '../lib/colors';
import { Check, X, CalendarPlus, Inbox } from 'lucide-react';
import type { ISODate, WorkBlock } from '../lib/types';

/**
 * Today desk — the execution queue: missed slips first (red, the only red in
 * the folio), then the planned queue, then the registrar's proposals. The
 * student sets available time, reorders, starts in Timer, stamps done, or
 * defers with a reason.
 */
export function TodayView({ onInspect, today }: { onInspect: (id: string) => void; today: ISODate }) {
  const s = useFolio();
  const courses = useFolio(useShallow(selectTermCourses));
  const blocks = useFolio(useShallow((st) => selectBlocksOnDate(st, today)));
  const missed = useFolio(useShallow((st) => selectMissed(st, today)));

  const [available, setAvailable] = useState(s.settings.defaultAvailableMinutes);
  const [selIdx, setSelIdx] = useState(0);
  const [deferFor, setDeferFor] = useState<WorkBlock | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const courseById = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [courses]);
  const openCommitments = useMemo(
    () => Object.values(s.commitments).filter((c) => courseById[c.courseId] && !courseById[c.courseId].archived),
    [s.commitments, courseById],
  );

  const dismissedSet = useMemo(
    () => new Set(s.dismissed[today] ?? []),
    [s.dismissed, today],
  );

  const plan = useMemo(
    () =>
      planDay({
        today,
        availableMinutes: available,
        commitments: openCommitments,
        all: s.commitments,
        courseById,
        blocksOnDay: blocks,
        dismissedIds: dismissedSet,
        startTime: s.settings.studyWindowStart,
        maxBlock: s.settings.maxBlockMinutes,
      }),
    [today, available, openCommitments, s.commitments, courseById, blocks, dismissedSet, s.settings],
  );

  const plannedTotal = blocks
    .filter((b) => b.state !== 'deferred')
    .reduce((sum, b) => sum + b.plannedMinutes, 0);
  const doneTotal = blocks
    .filter((b) => b.state === 'done')
    .reduce((sum, b) => sum + (b.actualMinutes ?? b.plannedMinutes), 0);

  const queue = blocks.filter((b) => b.state !== 'deferred');
  const clampSel = (n: number) => Math.max(0, Math.min(queue.length - 1, n));

  // j/k selection, enter=inspect, d=done, x=defer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return;
      if (deferFor) return;
      const b = queue[selIdx];
      const move = (dir: 1 | -1) => {
        if (!b) return;
        const ids = queue.map((x) => x.id);
        const j = selIdx + dir;
        if (j < 0 || j >= ids.length) return;
        [ids[selIdx], ids[j]] = [ids[j], ids[selIdx]];
        s.reorderBlocks(today, ids);
        setSelIdx(j);
      };
      if (e.key === 'J') { move(1); e.preventDefault(); }
      else if (e.key === 'K') { move(-1); e.preventDefault(); }
      else if (e.key === 'j') { setSelIdx((i) => clampSel(i + 1)); e.preventDefault(); }
      else if (e.key === 'k') { setSelIdx((i) => clampSel(i - 1)); e.preventDefault(); }
      else if (e.key === 'Enter' && b) onInspect(b.commitmentId);
      else if ((e.key === 'd' || e.key === 'D') && b && b.state !== 'done') s.completeBlock(b.id);
      else if ((e.key === 'x' || e.key === 'X') && b && b.state !== 'done') setDeferFor(b);
      else if ((e.key === 'p' || e.key === 'P') && b) s.togglePin(b.commitmentId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [queue, selIdx, deferFor, s, onInspect]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-block="${queue[selIdx]?.id}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selIdx, queue]);

  const startInTimer = (b: WorkBlock) => {
    const c = s.commitments[b.commitmentId];
    if (!c) return;
    const url = timerDeepLink({ settings: s.settings, block: b, commitment: c, course: courseById[c.courseId] });
    s.startBlock(b.id, url);
    window.open(url, '_blank', 'noopener');
  };

  const acceptAll = () => s.acceptProposals(plan.proposals);
  const acceptOne = (p: ProposedBlock) => s.acceptProposals([p]);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6" ref={listRef}>
      {/* agenda page header — the day's sheet torn from the filed syllabi */}
      <div className="text-center mb-1">
        <p className="kicker">DAILY AGENDA</p>
        <h1 className="slab text-[28px] font-semibold leading-tight mt-1">{fullDate(today)}</h1>
      </div>
      <div className="double-rule mt-3 mb-4" />
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <label className="flex items-center gap-2">
          <span className="f-label !mb-0">Hours open</span>
          <input
            type="number"
            min={0}
            step={15}
            value={available}
            onChange={(e) => setAvailable(Math.max(0, Number(e.target.value) || 0))}
            className="f-input mono w-[76px] !py-1.5 text-right"
            aria-label="Available minutes today"
          />
          <span className="mono text-[11px] text-[color:var(--color-ink-faint)]">min</span>
        </label>
        <div className="text-right">
          <div className="mono text-[11px] text-[color:var(--color-ink-soft)]">
            {fmtMinutes(doneTotal)} done / {fmtMinutes(plannedTotal)} planned
          </div>
          <div className="h-[5px] w-36 bg-[rgb(var(--ink-rgb)/0.08)] rounded-full mt-1 overflow-hidden">
            <div
              className="h-full bg-[rgb(var(--ok-rgb)/0.75)] transition-all duration-300"
              style={{ width: `${plannedTotal > 0 ? Math.min(100, (doneTotal / plannedTotal) * 100) : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* quick intake strip */}
      <QuickAdd courses={courses} autoFocusKey="n" />

      {/* ── missed slips — red lives only here ── */}
      {missed.length > 0 && (
        <section className="mt-6" aria-label="Missed blocks">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="kicker !text-[color:var(--color-late)]">MISSED — NEEDS RE-BOOKING</span>
            <span className="mono text-[10px] text-[color:var(--color-late)]">
              {missed.length} slip{missed.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="space-y-2 border-l-2 border-[color:var(--color-late)] pl-3">
            {missed.map((b) => {
              const c = s.commitments[b.commitmentId];
              const course = c ? courseById[c.courseId] : undefined;
              return (
                <div key={b.id} className="slip pl-6 pr-3 py-2 flex items-center gap-3">
                  <span className="absolute left-0 top-0 bottom-0 w-[6px] bg-[color:var(--color-late)]" aria-hidden />
                  <div className="flex-1 min-w-0">
                    <div className="mono text-[10.5px] text-[color:var(--color-late)] font-semibold">
                      {stampDate(b.plannedDate)} {b.plannedStart} · {fmtMinutes(b.plannedMinutes)}
                    </div>
                    <div className="slab text-[14.5px] font-medium truncate">
                      {course?.code} — {c?.title}
                    </div>
                  </div>
                  <button
                    className="btn btn--ghost !py-1.5 !px-3"
                    onClick={() => s.carryBlock(b.id, today)}
                    title="Re-book onto today"
                  >
                    Today
                  </button>
                  <button
                    className="btn btn--ghost !py-1.5 !px-3"
                    onClick={() => s.carryBlock(b.id, addDaysISO(today, 1))}
                    title="Re-book onto tomorrow"
                  >
                    +1d
                  </button>
                  <button className="xbtn" onClick={() => setDeferFor(b)} title="Pick a date" aria-label="Pick a new date">
                    <CalendarPlus size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── the queue — numbered agenda items ── */}
      <section className="mt-7" aria-label="Agenda items">
        <div className="flex items-center justify-between mb-2.5">
          <span className="kicker">AGENDA ITEMS</span>
          <span className="mono text-[10px] text-[color:var(--color-ink-faint)]">j/k select · J/K move · D done · X defer · Enter open</span>
        </div>
        {queue.length === 0 ? (
          <div className="slip pl-6 pr-4 py-8 text-center">
            <Inbox size={20} className="mx-auto text-[color:var(--color-ink-faint)] mb-2" />
            <p className="slab text-[16px] text-[color:var(--color-ink-soft)]">Nothing booked yet.</p>
            <p className="text-[12px] text-[color:var(--color-ink-faint)] mt-1">
              Accept proposals below, or file commitments on the Semester folio.
            </p>
          </div>
        ) : (
          <ol className="space-y-2">
            {queue.map((b, i) => {
              const c = s.commitments[b.commitmentId];
              return (
                <li
                  key={b.id}
                  style={{ animationDelay: `${i * 30}ms` }}
                  className="animate-[slip-in_0.3s_cubic-bezier(0.22,0.9,0.3,1)_both] flex items-baseline gap-2"
                >
                  <span className="mono text-[10px] text-[color:var(--color-ink-faint)] w-7 shrink-0 text-right select-none" aria-hidden>
                    ¶ {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <BlockSlip
                      block={b}
                      commitment={c}
                      course={c ? courseById[c.courseId] : undefined}
                      selected={i === selIdx}
                      onSelect={() => setSelIdx(i)}
                      onStart={b.state !== 'done' ? () => startInTimer(b) : undefined}
                      onDone={b.state !== 'done' ? () => s.completeBlock(b.id) : undefined}
                      onDefer={b.state !== 'done' ? () => setDeferFor(b) : undefined}
                      onInspect={() => onInspect(b.commitmentId)}
                      onUnstamp={b.state === 'done' ? () => s.unstampBlock(b.id) : undefined}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* ── registrar's proposals ── */}
      <section className="mt-8" aria-label="Proposed blocks">
        <div className="flex items-center justify-between mb-2.5">
          <span className="kicker">PROPOSED — REGISTRAR'S SUGGESTION</span>
          {plan.proposals.length > 0 && (
            <button className="btn btn--ghost !py-1 !px-3" onClick={acceptAll}>
              Accept all
            </button>
          )}
        </div>
        {plan.proposals.length === 0 ? (
          <p className="text-[12.5px] text-[color:var(--color-ink-faint)] pl-1">
            {openCommitments.length === 0
              ? 'No open commitments on file.'
              : available <= plannedTotal
                ? 'Day is fully booked — raise available time for more proposals.'
                : 'Nothing pressing. The registrar sees no urgent filings.'}
          </p>
        ) : (
          <ol className="space-y-2">
            {plan.proposals.map((p, i) => {
              const c = s.commitments[p.commitmentId];
              const course = c ? courseById[c.courseId] : undefined;
              return (
                <li
                  key={`${p.commitmentId}-${i}`}
                  className="slip pl-6 pr-3 py-2.5 flex items-center gap-3 border-dashed animate-[slip-in_0.3s_cubic-bezier(0.22,0.9,0.3,1)_both]"
                  style={{ animationDelay: `${i * 40}ms`, borderStyle: 'dashed', borderWidth: 1 }}
                >
                  <span
                    className="absolute left-0 top-0 bottom-0 w-[6px]"
                    style={{ background: course ? courseColorVar(course.color) : 'var(--color-rule-dark)' }}
                    aria-hidden
                  />
                  <div className="flex-1 min-w-0">
                    <div className="mono text-[11px] text-[color:var(--color-ink-soft)]">
                      {p.plannedStart} · {fmtMinutes(p.plannedMinutes)} · {p.label}
                    </div>
                    <div className={cn('slab text-[15px] font-medium', p.late && 'text-[color:var(--color-late)]')}>
                      {course?.code} — {c?.title}
                    </div>
                    <p className="text-[11.5px] text-[color:var(--color-ink-soft)] mt-0.5">{p.reasons[0]}</p>
                  </div>
                  <button className="xbtn" onClick={() => acceptOne(p)} title="Book this slip" aria-label="Accept proposal">
                    <Check size={15} />
                  </button>
                  <button
                    className="xbtn"
                    onClick={() => s.dismissProposal(today, p.commitmentId)}
                    title="Decline for today"
                    aria-label="Decline proposal"
                  >
                    <X size={15} />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        {plan.unmet > 0 && (
          <p className="mono text-[11px] text-[color:var(--color-ink-faint)] mt-3 pl-1">
            {fmtMinutes(plan.unmet)} of effort won't fit today — it stays on the books for tomorrow's plan.
          </p>
        )}
      </section>

      {/* defer sheet */}
      {deferFor && (
        <DeferSheet
          block={deferFor}
          onClose={() => setDeferFor(null)}
          onDefer={(date, note) => {
            s.deferBlock(deferFor.id, note, date);
            setDeferFor(null);
          }}
        />
      )}
    </div>
  );
}

/** Defer sheet — reason + new date; the slip keeps its history. */
function DeferSheet({
  block,
  onClose,
  onDefer,
}: {
  block: WorkBlock;
  onClose: () => void;
  onDefer: (date: ISODate | undefined, note: string) => void;
}) {
  const [date, setDate] = useState<ISODate>(addDaysISO(block.plannedDate, 1));
  const [note, setNote] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector('select')?.focus();
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(var(--desk-rgb)/0.72)] p-4" role="dialog" aria-modal="true" aria-label="Defer block" onClick={onClose}>
      <div ref={ref} className="sheet w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <div className="kicker mb-1">RE-BOOKING SLIP</div>
        <h3 className="slab text-lg font-semibold mb-3">Defer this block</h3>
        <label className="block mb-3">
          <span className="f-label">Reason (filed on the slip)</span>
          <select className="f-select" value={note} onChange={(e) => setNote(e.target.value)}>
            <option value="">— choose a reason —</option>
            <option value="ran out of time">Ran out of time</option>
            <option value="not ready — need review first">Not ready — need review first</option>
            <option value="waited on materials">Waited on materials</option>
            <option value="energy low — moved deliberately">Energy low — moved deliberately</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="block mb-4">
          <span className="f-label">Re-book to</span>
          <input type="date" className="f-input" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="flex justify-end gap-2">
          <button className="btn btn--ghost" onClick={onClose}>Keep as is</button>
          <button className="btn" onClick={() => onDefer(date, note)}>Re-book</button>
        </div>
      </div>
    </div>
  );
}
