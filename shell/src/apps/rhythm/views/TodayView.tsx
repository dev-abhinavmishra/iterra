// ── Today — the running measure ──────────────────────────────────────────────
// Acceptance criterion: a manual check-in takes at most two direct actions.
//   check routine   → hit the pad (1)
//   amount routine  → hit the pad, confirm the amount (2)
// Each channel row is a strip on the sequencer: hit pad, label, level meter,
// and the week's seven steps with the playhead sweeping through.
// A routine "skipped" gets a friction note, not a scolding.

import { useEffect, useMemo, useState } from 'react';
import { useRegister } from '../store';
import type { Routine } from '../lib/types';
import { dayState, isScheduled, perDayBar, routineWeek } from '../lib/register';
import { bandFor } from '../lib/bands';
import { addDaysISO, fmtDay, fmtDayFull, fmtTime, fmtWeekRange, todayISO, weekStartISO } from '../lib/dates';
import { folioInbox, planFolio, type FolioCommitment } from '../lib/iterra-adapter';
import { EXCEPTION_LABEL, FRICTION_LABEL, cx } from '../lib/utils';
import { usePlayhead } from '../lib/playhead';
import { useSharedFocus } from '../lib/iterra';
import { Pad } from '../components/Pad';
import { Lamp } from '../components/Lamp';
import { Sheet } from '../components/Sheet';
import { Field } from '../components/Field';
import { Minus, Plus, StickyNote, XCircle } from 'lucide-react';

export function TodayView({ openRoutine }: { openRoutine: (id: string) => void }) {
  const routines = useRegister((s) => s.routines);
  const entries = useRegister((s) => s.entries);
  const exceptions = useRegister((s) => s.exceptions);
  const courses = useRegister((s) => s.courses);
  const settings = useRegister((s) => s.settings);
  const focusedRoutineName = useRegister((s) => s.focusedRoutineName);
  const sharedFocus = useSharedFocus();
  const checkIn = useRegister((s) => s.checkIn);
  const logFriction = useRegister((s) => s.logFriction);
  const addException = useRegister((s) => s.addException);
  const removeEntry = useRegister((s) => s.removeEntry);
  const resumeRoutine = useRegister((s) => s.resumeRoutine);

  const today = todayISO();
  const [amountFor, setAmountFor] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [frictionFor, setFrictionFor] = useState<string | null>(null);
  const [frictionKind, setFrictionKind] = useState<string>('tired');
  const [frictionNote, setFrictionNote] = useState('');
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [justStamped, setJustStamped] = useState<string | null>(null);

  /* a deep-linked routine pins to the top — ONCE. Snapshot the consumed
     name into mount state and clear the store flag: otherwise a stale link
     keeps re-pinning itself over the day's real order on every revisit */
  const [pinnedName, setPinnedName] = useState<string | null>(focusedRoutineName);
  useEffect(() => {
    if (!focusedRoutineName) return;
    setPinnedName(focusedRoutineName);
    useRegister.setState({ focusedRoutineName: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedRoutineName]);

  const list = useMemo(() => {
    const all = Object.values(routines).filter((r) => r.status !== 'archived');
    const scheduled = all.filter((r) => r.status === 'active' && isScheduled(r, today));
    const open = all.filter((r) => r.status === 'active' && !isScheduled(r, today));
    const paused = all.filter((r) => r.status === 'paused');
    if (pinnedName) {
      const i = scheduled.findIndex((r) => r.name.toLowerCase() === pinnedName.toLowerCase());
      if (i > 0) scheduled.unshift(scheduled.splice(i, 1)[0]);
    }
    return { scheduled, open, paused };
  }, [routines, today, pinnedName]);

  /* Unhit clears every entry the day carries for that channel — the step
     returns to un-programmed. The triggering event stays in the ledger, so
     nothing about the evidence is lost. */
  const unhitToday = (routineId: string) => {
    for (const e of Object.values(entries)) {
      if (e.routineId === routineId && e.date === today) removeEntry(e.id);
    }
  };

  const stamp = (r: Routine, isMinimum = false) => {
    if (r.measure === 'check') {
      // A lit pad toggles — pressing a hit step clears the mark again.
      const st = dayState(r, today, entries, exceptions, today);
      if (!isMinimum && (st === 'full' || st === 'minimum')) {
        unhitToday(r.id);
        return;
      }
      const e = checkIn(r.id, { isMinimum });
      if (e) {
        setJustStamped(r.id);
        window.setTimeout(() => setJustStamped((cur) => (cur === r.id ? null : cur)), 400);
      }
    } else {
      setAmountFor(r.id);
      setAmount(String(isMinimum ? Math.max(1, Math.ceil(perDayBar(r) / 2)) : perDayBar(r)));
    }
  };

  const confirmAmount = (r: Routine, isMinimum = false) => {
    const v = Number(amount);
    // A step only sounds on a positive amount — a zero isn't a hit.
    if (!Number.isFinite(v) || v <= 0) return;
    checkIn(r.id, { value: v, isMinimum });
    setAmountFor(null);
    setJustStamped(r.id);
    window.setTimeout(() => setJustStamped((cur) => (cur === r.id ? null : cur)), 400);
  };

  const week = weekStartISO(today, settings.weekStartsOn);

  return (
    <div>
      {/* ── Masthead — the transport readout ─────────────────────── */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="kicker mb-1.5">This measure — week of {fmtWeekRange(week)}</div>
          <div className="lcd inline-block px-3 py-1.5 text-xl leading-none tracking-[0.08em]">
            {fmtDayFull(today)}
          </div>
        </div>
        <TodayPace />
      </div>

      {sharedFocus && (
        <div className="kicker mb-4" aria-label="Focus running">
          focus running — {sharedFocus.v?.label || 'unnamed block'}
        </div>
      )}

      {/* ── Live channels ────────────────────────────────────────── */}
      {list.scheduled.length === 0 && list.open.length === 0 && list.paused.length === 0 && (
        <div className="py-10 text-center">
          <p className="disp text-lg text-ink-soft">No channels patched in.</p>
          <p className="mt-1 text-sm text-ink-faint">Patch the first channel from Setup or the onboarding sheet.</p>
        </div>
      )}

      {list.scheduled.length > 0 && (
        <section aria-label="Due today">
          <div className="divide-y-0 border-y border-rule">
            {list.scheduled.map((r) => (
              <RoutineRow
                key={r.id}
                routine={r}
                today={today}
                weekStart={week}
                state={dayState(r, today, entries, exceptions, today)}
                justStamped={justStamped === r.id}
                amountOpen={amountFor === r.id}
                amount={amount}
                courseCode={r.courseId ? courses[r.courseId]?.code : undefined}
                onStamp={() => stamp(r)}
                onMinimum={() => stamp(r, true)}
                onAmount={setAmount}
                onAmountConfirm={() => confirmAmount(r)}
                onAmountMinimum={() => confirmAmount(r, true)}
                onAmountClose={() => setAmountFor(null)}
                onNote={() => {
                  setNoteFor(r.id);
                  setNote('');
                }}
                onFriction={() => {
                  setFrictionFor(r.id);
                  setFrictionKind('tired');
                  setFrictionNote('');
                }}
                onOpen={() => openRoutine(r.id)}
                onUndo={() => unhitToday(r.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Off the grid — unscheduled today, hittable anyway ────── */}
      {list.open.length > 0 && (
        <section className="mt-6" aria-label="Not scheduled today">
          <div className="kicker mb-2">Off the grid today — hit them anyway</div>
          <div className="divide-y-0 border-y border-rule opacity-90">
            {list.open.map((r) => (
              <RoutineRow
                key={r.id}
                routine={r}
                today={today}
                weekStart={week}
                state={dayState(r, today, entries, exceptions, today)}
                justStamped={justStamped === r.id}
                amountOpen={amountFor === r.id}
                amount={amount}
                courseCode={r.courseId ? courses[r.courseId]?.code : undefined}
                offday
                onStamp={() => stamp(r)}
                onMinimum={() => stamp(r, true)}
                onAmount={setAmount}
                onAmountConfirm={() => confirmAmount(r)}
                onAmountMinimum={() => confirmAmount(r, true)}
                onAmountClose={() => setAmountFor(null)}
                onNote={() => {
                  setNoteFor(r.id);
                  setNote('');
                }}
                onFriction={() => {
                  setFrictionFor(r.id);
                  setFrictionKind('tired');
                  setFrictionNote('');
                }}
                onOpen={() => openRoutine(r.id)}
                onUndo={() => unhitToday(r.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Muted channels — parked, not deleted ─────────────────── */}
      {list.paused.length > 0 && (
        <section className="mt-6" aria-label="Paused routines">
          <div className="kicker mb-2">Muted — intentionally parked</div>
          <div className="divide-y-0 border-y border-rule">
            {list.paused.map((r) => (
              <div key={r.id} className="chan flex items-center gap-3 px-2 py-2.5">
                <Pad state="paused" accent={r.accent} title="paused" />
                <div className="min-w-0 flex-1">
                  <button onClick={() => openRoutine(r.id)} className="disp truncate text-[15px] hover:underline">
                    {r.name}
                  </button>
                  {r.pauseReason && <div className="text-[11px] text-ink-faint">{r.pauseReason}</div>}
                </div>
                <button className="btn btn--quiet" onClick={() => resumeRoutine(r.id)}>
                  Unmute
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── From the folio — UX-TRACKER #72: open syllabus commitments
          offered as one-click channel scaffolds (same mapping as the
          adapter's 'routine.plan' intake, via planFolio) ─────────── */}
      <FolioInbox />

      {/* ── Day actions ──────────────────────────────────────────── */}
      <div className="mt-5 flex flex-wrap gap-2 no-print">
        <button className="btn btn--quiet" onClick={() => setExceptionOpen(true)}>
          Mute today — an exception…
        </button>
      </div>

      {/* ── Sheets ───────────────────────────────────────────────── */}
      {noteFor && (
        <Sheet title="A note on today's step" onClose={() => setNoteFor(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const r = routines[noteFor];
              if (r && note.trim()) {
                const entry = checkIn(noteFor, {
                  value: r.measure === 'check' ? 1 : perDayBar(r),
                  note,
                });
                if (!entry) {
                  // already hit — attach the note to today's first entry
                  const ex = Object.values(entries).find(
                    (en) => en.routineId === noteFor && en.date === today,
                  );
                  if (ex) useRegister.getState().updateEntryNote(ex.id, note);
                }
              }
              setNoteFor(null);
              setJustStamped(noteFor);
            }}
            className="space-y-4"
          >
            <Field label="Note (private — stays on this machine)">
              <textarea
                className="f-textarea"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. studied in the library, felt easier"
                autoFocus
              />
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn--quiet" onClick={() => setNoteFor(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary">
                Save note
              </button>
            </div>
          </form>
        </Sheet>
      )}

      {frictionFor && (
        <Sheet title="Why it didn't sound today" onClose={() => setFrictionFor(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              logFriction({
                routineId: frictionFor,
                kind: frictionKind as never,
                note: frictionNote || undefined,
              });
              setFrictionFor(null);
            }}
            className="space-y-4"
          >
            <Field label="What got in the way">
              <select className="f-select" value={frictionKind} onChange={(e) => setFrictionKind(e.target.value)}>
                {Object.entries(FRICTION_LABEL).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Note (optional, private)">
              <input
                className="f-input"
                value={frictionNote}
                onChange={(e) => setFrictionNote(e.target.value)}
                placeholder="e.g. practice ran late"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn--quiet" onClick={() => setFrictionFor(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary">
                Log friction
              </button>
            </div>
          </form>
        </Sheet>
      )}

      {exceptionOpen && (
        <ExceptionSheet
          routines={list.scheduled.concat(list.open)}
          onClose={() => setExceptionOpen(false)}
          onAdd={(routineId, kind, noteText) => {
            addException({ routineId, date: today, kind: kind as never, note: noteText });
            setExceptionOpen(false);
          }}
        />
      )}

      {/* hidden live region for screen-reader hit confirmations */}
      <div aria-live="polite" className="sr-only">
        {justStamped ? `${routines[justStamped]?.name ?? 'Routine'} hit` : ''}
      </div>
    </div>
  );
}

// ── One channel strip ─────────────────────────────────────────────────────────

function RoutineRow({
  routine: r,
  today,
  weekStart,
  state,
  justStamped,
  amountOpen,
  amount,
  courseCode,
  offday,
  onStamp,
  onMinimum,
  onAmount,
  onAmountConfirm,
  onAmountMinimum,
  onAmountClose,
  onNote,
  onFriction,
  onOpen,
  onUndo,
}: {
  routine: Routine;
  today: string;
  weekStart: string;
  state: ReturnType<typeof dayState>;
  justStamped: boolean;
  amountOpen: boolean;
  amount: string;
  courseCode?: string;
  offday?: boolean;
  onStamp: () => void;
  onMinimum: () => void;
  onAmount: (v: string) => void;
  onAmountConfirm: () => void;
  onAmountMinimum: () => void;
  onAmountClose: () => void;
  onNote: () => void;
  onFriction: () => void;
  onOpen: () => void;
  onUndo: () => void;
}) {
  const entries = useRegister((s) => s.entries);
  const exceptions = useRegister((s) => s.exceptions);
  const settings = useRegister((s) => s.settings);
  const wk = routineWeek(r, weekStart, entries, exceptions, today, settings.weekStartsOn);
  const done = state === 'full' || state === 'minimum' || state === 'partial';
  const unitLabel = r.measure === 'duration' ? 'min' : r.unit || r.measure;
  // the second action only fires on a real amount — 0 or NaN stays silent
  const amountOk = Number.isFinite(Number(amount)) && Number(amount) > 0;

  const progress =
    r.measure === 'check'
      ? `${wk.actual}/${wk.effectiveTarget} days`
      : `${wk.actual}/${r.target.perWeek} ${unitLabel} this week`;

  return (
    <div className="chan px-2 py-2.5">
      <div className="flex items-center gap-3">
        {/* the hit pad — one press records the day; for check routines a lit
            pad toggles back off, for measured ones it logs another session */}
        <button
          onClick={onStamp}
          aria-label={
            done
              ? r.measure === 'check'
                ? `Unhit ${r.name} — today is marked ${state}`
                : `Log another ${r.name} — today is ${state}`
              : `Hit ${r.name}`
          }
          aria-pressed={done}
          className="padbtn"
          style={{ ['--pad-rgb' as never]: `var(--acc-${r.accent}-rgb)` }}
        >
          <Pad
            state={done ? state : 'unscheduled'}
            accent={r.accent}
            size={30}
            hit={justStamped}
            title={done ? state : `hit ${r.name}`}
          />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <button onClick={onOpen} className="disp truncate text-[15px] hover:underline" title="open channel">
              {r.name}
            </button>
            {courseCode && <span className="mono text-[10px] uppercase text-ink-faint">{courseCode}</span>}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="mono text-[10.5px] text-ink-soft">{progress}</span>
            <span className="meter w-16" style={{ color: `var(--color-acc-${r.accent})` }}>
              <i
                style={{
                  width: `${Math.min(100, (wk.actual / Math.max(1, wk.effectiveTarget)) * 100)}%`,
                }}
              />
            </span>
            {r.windowStart && r.windowEnd && (
              <span className="mono text-[10px] text-ink-faint">
                {fmtTime(r.windowStart)}–{fmtTime(r.windowEnd)}
              </span>
            )}
          </div>
        </div>

        {/* this week's measure — seven steps, playhead sweeping */}
        <MeasureStrip routine={r} weekStart={weekStart} today={today} />

        {/* channel controls — quiet, never loud */}
        <div className="flex items-center gap-1">
          {r.minimum && !done && (
            <button className="btn btn--quiet !px-2 !py-1" onClick={onMinimum} title={`minimum: ${r.minimum.label}`}>
              min
            </button>
          )}
          {done && (
            <button className="btn btn--quiet !px-2 !py-1" onClick={onUndo} title="unhit today">
              unhit
            </button>
          )}
          <IconBtn label="note" onClick={onNote}>
            <StickyNote size={13} />
          </IconBtn>
          {!done && (
            <IconBtn label="didn't happen — log friction" onClick={onFriction}>
              <XCircle size={13} />
            </IconBtn>
          )}
        </div>
      </div>

      {/* amount intake — the second action for measured routines */}
      {amountOpen && (
        <form
          className="mt-2 ml-[52px] flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onAmountConfirm();
          }}
        >
          <button
            type="button"
            className="btn btn--quiet !px-1.5"
            aria-label="less"
            onClick={() => onAmount(String(Math.max(0, Number(amount) - (r.measure === 'duration' ? 5 : 1))))}
          >
            <Minus size={12} />
          </button>
          <input
            className="f-input !w-24 text-center"
            inputMode="numeric"
            value={amount}
            onChange={(e) => onAmount(e.target.value)}
            aria-label={`amount in ${unitLabel}`}
            autoFocus
          />
          <button
            type="button"
            className="btn btn--quiet !px-1.5"
            aria-label="more"
            onClick={() => onAmount(String(Number(amount) + (r.measure === 'duration' ? 5 : 1)))}
          >
            <Plus size={12} />
          </button>
          <span className="mono text-[11px] text-ink-soft">{unitLabel}</span>
          <button type="submit" className="btn btn--primary !px-3 !py-1.5" disabled={!amountOk}>
            Hit
          </button>
          {r.minimum && (
            <button type="button" className="btn btn--quiet !px-2 !py-1.5" onClick={onAmountMinimum} disabled={!amountOk}>
              as minimum
            </button>
          )}
          <button type="button" className="btn btn--quiet !px-2 !py-1.5" onClick={onAmountClose}>
            ×
          </button>
          {offday && <span className="mono text-[10px] text-ink-faint">not a scheduled step — it still counts</span>}
        </form>
      )}
    </div>
  );
}

// ── The measure strip — this week's seven steps on the channel ───────────────

export function MeasureStrip({ routine, weekStart, today, size = 15 }: { routine: Routine; weekStart: string; today: string; size?: number }) {
  const entries = useRegister((s) => s.entries);
  const exceptions = useRegister((s) => s.exceptions);
  const motion = useRegister((s) => s.settings.motion);
  const play = usePlayhead(motion === 'full');
  const todayIdx = useMemo(() => {
    for (let i = 0; i < 7; i++) if (addDaysISO(weekStart, i) === today) return i;
    return -1;
  }, [weekStart, today]);

  return (
    <div className="hidden items-center gap-[3px] sm:flex" aria-hidden="true" title="this week's steps">
      {Array.from({ length: 7 }, (_, i) => {
        const d = addDaysISO(weekStart, i);
        const st = dayState(routine, d, entries, exceptions, today);
        return (
          <span
            key={d}
            className={cx('flex items-center justify-center rounded-[3px]', i === play && 'step--play', i === todayIdx && 'step--now')}
            style={{ width: size + 4, height: size + 4 }}
            title={`${fmtDayFull(d)} — ${st}`}
          >
            <Pad state={st} accent={routine.accent} size={size} />
          </span>
        );
      })}
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded p-1.5 text-ink-faint hover:bg-white/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-indigo)]"
    >
      {children}
    </button>
  );
}

// ── "On pace" — band lamps, no streaks ───────────────────────────────────────

function TodayPace() {
  const routines = useRegister((s) => s.routines);
  const entries = useRegister((s) => s.entries);
  const exceptions = useRegister((s) => s.exceptions);
  const experiments = useRegister((s) => s.experiments);
  const settings = useRegister((s) => s.settings);
  const today = todayISO();

  const bands = Object.values(routines)
    .filter((r) => r.status !== 'archived')
    .map((r) => ({ r, b: bandFor(r, entries, exceptions, experiments, today, settings.weekStartsOn) }));

  const recovering = bands.filter((x) => x.b.band === 'recovery');
  return (
    <div className="text-right">
      <div className="flex flex-wrap justify-end gap-1.5">
        {bands.slice(0, 4).map(({ r, b }) => (
          <Lamp key={r.id} band={b.band} />
        ))}
      </div>
      {recovering.length > 0 && (
        <p className="mt-1.5 max-w-52 text-[11px] leading-snug text-ink-soft">
          {recovering.length === 1
            ? `${recovering[0].r.name} is in recovery — the minimum version keeps the pattern alive.`
            : `${recovering.length} routines in recovery — minimum versions keep the pattern alive.`}
        </p>
      )}
    </div>
  );
}

// ── Exception sheet ──────────────────────────────────────────────────────────

function ExceptionSheet({
  routines,
  onClose,
  onAdd,
}: {
  routines: Routine[];
  onClose: () => void;
  onAdd: (routineId: string | 'all', kind: string, note?: string) => void;
}) {
  const [routineId, setRoutineId] = useState<string>('all');
  const [kind, setKind] = useState('travel');
  const [note, setNote] = useState('');
  return (
    <Sheet title="Mute today — an exception" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd(routineId, kind, note || undefined);
        }}
      >
        <p className="text-[12px] leading-snug text-ink-soft">
          Travel, exams, and sick days happen. An exception mutes the step — it stays on the
          tape, and it is never counted as a miss.
        </p>
        <Field label="Applies to">
          <select className="f-select" value={routineId} onChange={(e) => setRoutineId(e.target.value)}>
            <option value="all">Every channel today</option>
            {routines.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Kind">
          <select className="f-select" value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(EXCEPTION_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Note (optional)">
          <input className="f-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. debate tournament in Fresno" />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn--quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary">
            Mute the step
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/* ── From the folio — UX-TRACKER #72 ─────────────────────────────────────────
   Open syllabus commitments listed on the register with a one-click "+ plan".
   Rows come from folioInbox() (the adapter's store read); "+ plan" calls
   planFolio(), the same mapping the 'routine.plan' intake uses, so an inbox
   plan and a syllabus-sent plan produce identical routines. A commitment
   already on the register (name match) reads "on the register" instead. */
function FolioInbox() {
  const [rows, setRows] = useState<FolioCommitment[] | null>(null);
  const routineNames = useRegister((s) =>
    Object.values(s.routines)
      .map((r) => r.name.trim().toLowerCase())
      .join(''),
  );
  useEffect(() => {
    let live = true;
    void folioInbox().then((r) => {
      if (live) setRows(r);
    });
    return () => {
      live = false;
    };
  }, []);
  if (!rows?.length) return null;
  const planned = new Set(routineNames.split(''));
  return (
    <section className="mt-6" aria-label="From the folio">
      <div className="kicker mb-2">From the folio — open commitments</div>
      <div className="divide-y-0 border-y border-rule">
        {rows.map((c) => {
          const on = planned.has(c.title.trim().toLowerCase());
          return (
            <div key={c.id} className="chan flex items-center gap-3 px-2 py-2">
              <div className="min-w-0 flex-1">
                <span className="disp text-[14px]">{c.title}</span>
                <span className="mono ml-3 text-[10px] uppercase text-ink-faint">
                  {[c.course, c.dueAt ? `due ${fmtDay(c.dueAt.slice(0, 10))}` : 'no due date'].filter(Boolean).join(' · ')}
                </span>
              </div>
              {on ? (
                <span className="mono text-[10px] uppercase text-ink-faint">on the register</span>
              ) : (
                <button
                  type="button"
                  className="btn btn--quiet shrink-0"
                  onClick={() => {
                    void planFolio(c).then((r) => {
                      /* the routine name match above flips this row on its own;
                         re-pull so a just-planned row can't be clicked twice */
                      if (r) void folioInbox().then(setRows);
                    });
                  }}
                >
                  + plan
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
