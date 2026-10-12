// ── Pattern — the step grid ──────────────────────────────────────────────────
// Contribution-style columns of measures, but every cell is a pad whose
// SHAPE (not color) carries the state, every cell is a real keyboard-focusable
// button, and a "list" toggle renders the same range as a plain table — the
// explicit text equivalent required by the acceptance criteria. The playhead
// sweeps the current measure; the current step is outlined.

import { useMemo, useState } from 'react';
import { useRegister } from '../store';
import type { Entry, ISODate, Routine } from '../lib/types';
import { dayState, exceptionFor, isScheduled, type DayState } from '../lib/register';
import { addDaysISO, diffDaysISO, fmtDay, fmtDayFull, todayISO, weekStartISO } from '../lib/dates';
import { cx, WEEKDAY_NAMES } from '../lib/utils';
import { usePlayhead } from '../lib/playhead';
import { Pad } from '../components/Pad';
import { Sheet } from '../components/Sheet';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { FRICTION_LABEL, EXCEPTION_LABEL } from '../lib/utils';
import { APP_DISPLAY, evidenceUrl } from '../lib/links';

const STATE_WORD: Record<DayState, string> = {
  full: 'complete',
  minimum: 'met at minimum',
  partial: 'partial',
  missed: 'missed',
  exception: 'excused',
  paused: 'paused',
  unscheduled: 'not scheduled',
  future: 'upcoming',
};

export function HeatmapView({ openRoutine }: { openRoutine: (id: string) => void }) {
  const routines = useRegister((s) => s.routines);
  const courses = useRegister((s) => s.courses);
  const settings = useRegister((s) => s.settings);

  const today = todayISO();
  const [weeks, setWeeks] = useState(12);
  const [offset, setOffset] = useState(0); // weeks back from the current week
  const [routineId, setRoutineId] = useState<string>('all');
  const [courseId, setCourseId] = useState<string>('all');
  const [ledger, setLedger] = useState(false);
  const [daySheet, setDaySheet] = useState<{ routine: Routine; date: ISODate } | null>(null);

  const active = useMemo(
    () =>
      Object.values(routines)
        .filter((r) => r.status !== 'archived')
        .filter((r) => routineId === 'all' || r.id === routineId)
        .filter((r) => courseId === 'all' || r.courseId === courseId),
    [routines, routineId, courseId],
  );

  const endWeek = weekStartISO(addDaysISO(today, -7 * offset), settings.weekStartsOn);

  return (
    <div>
      {/* ── Controls ─────────────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-end gap-x-5 gap-y-3 no-print">
        <div>
          <span className="f-label">Routine</span>
          <select className="f-select !w-44" value={routineId} onChange={(e) => setRoutineId(e.target.value)}>
            <option value="all">Every routine</option>
            {Object.values(routines)
              .filter((r) => r.status !== 'archived')
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </select>
        </div>
        <div>
          <span className="f-label">Course</span>
          <select className="f-select !w-40" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="all">All courses</option>
            {Object.values(courses).map((c) => (
              <option key={c.id} value={c.id}>
                {c.code || c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="f-label">Range</span>
          <select className="f-select !w-32" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
            {[4, 8, 12, 16, 24].map((w) => (
              <option key={w} value={w}>
                {w} weeks
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <button className="btn btn--quiet !px-2" onClick={() => setOffset((o) => o + weeks)} aria-label="earlier">
            <ChevronLeft size={13} />
          </button>
          <button
            className="btn btn--quiet !px-2"
            onClick={() => setOffset((o) => Math.max(0, o - weeks))}
            disabled={offset === 0}
            aria-label="later"
          >
            <ChevronRight size={13} />
          </button>
          <button className={cx('btn ml-2', ledger ? '' : 'btn--quiet')} onClick={() => setLedger((l) => !l)}>
            {ledger ? 'Grid view' : 'List view'}
          </button>
        </div>
      </div>

      {/* ── The grid (or its list equivalent) ────────────────────── */}
      <div key={`${weeks}-${offset}-${routineId}-${courseId}-${ledger}`} style={{ animation: 'var(--animate-page-turn)' }}>
        {active.length === 0 && (
          <p className="py-10 text-center text-sm text-ink-faint">No routines match this filter.</p>
        )}
        {active.map((r) =>
          ledger ? (
            <RoutineLedger key={r.id} routine={r} endWeek={endWeek} weeks={weeks} onOpen={() => openRoutine(r.id)} />
          ) : (
            <RoutineGrid
              key={r.id}
              routine={r}
              endWeek={endWeek}
              weeks={weeks}
              onOpen={() => openRoutine(r.id)}
              onDay={(date) => setDaySheet({ routine: r, date })}
            />
          ),
        )}
      </div>

      {/* ── Legend — shapes first, words attached ────────────────── */}
      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-rule pt-3">
        <span className="kicker">Legend</span>
        {(['full', 'minimum', 'partial', 'missed', 'exception', 'paused'] as DayState[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <Pad state={s} size={18} />
            <span className="text-[11px] text-ink-soft">{STATE_WORD[s]}</span>
          </span>
        ))}
      </div>

      {daySheet && <DaySheet routine={daySheet.routine} date={daySheet.date} onClose={() => setDaySheet(null)} />}
    </div>
  );
}

// ── One routine's week columns ───────────────────────────────────────────────

function RoutineGrid({
  routine,
  endWeek,
  weeks,
  onOpen,
  onDay,
}: {
  routine: Routine;
  endWeek: ISODate;
  weeks: number;
  onOpen: () => void;
  onDay: (date: ISODate) => void;
}) {
  const entries = useRegister((s) => s.entries);
  const exceptions = useRegister((s) => s.exceptions);
  const settings = useRegister((s) => s.settings);
  const play = usePlayhead(settings.motion === 'full');
  const today = todayISO();

  // One channel row per measure: a mono week label, then seven step pads.
  const starts: ISODate[] = [];
  for (let i = weeks - 1; i >= 0; i--) starts.push(addDaysISO(endWeek, -7 * i));
  const currentWeek = starts[starts.length - 1];
  const todayDiff = diffDaysISO(today, currentWeek);
  const todayInWeek = todayDiff >= 0 && todayDiff < 7 ? todayDiff : -1;

  return (
    <section className="mb-6" aria-label={`${routine.name} — pattern`}>
      <div className="mb-1.5 flex items-baseline gap-2">
        <button onClick={onOpen} className="disp text-[14px] hover:underline">
          {routine.name}
        </button>
        <span className="mono text-[10px] uppercase tracking-wider" style={{ color: `var(--color-acc-${routine.accent})` }}>
          {routine.measure === 'check' ? 'shows up' : routine.unit || routine.measure}
        </span>
      </div>
      <div
        role="grid"
        aria-label={`${routine.name} days for the last ${weeks} weeks`}
        className="max-w-xl"
      >
        <div className="mb-0.5 grid items-center" style={{ gridTemplateColumns: '58px repeat(7, minmax(0,1fr))' }} role="row">
          <span />
          {Array.from({ length: 7 }, (_, i) => (settings.weekStartsOn + i) % 7).map((wd) => (
            <span key={wd} className="mono text-center text-[9px] uppercase text-ink-faint" role="columnheader">
              {WEEKDAY_NAMES[wd]}
            </span>
          ))}
        </div>
        {starts.map((ws) => {
          const isCurrent = ws === currentWeek;
          return (
            <div
              key={ws}
              className={cx('grid items-center border-b border-rule/60 last:border-none', isCurrent && 'rounded-sm bg-white/[0.025]')}
              style={{ gridTemplateColumns: '58px repeat(7, minmax(0,1fr))' }}
              role="row"
            >
              <span className={cx('mono py-0.5 text-[9px] uppercase', isCurrent ? 'text-indigo' : 'text-ink-faint')}>{fmtDay(ws)}</span>
              {Array.from({ length: 7 }, (_, d) => {
                const date = addDaysISO(ws, d);
                const state = dayState(routine, date, entries, exceptions, today);
                const val = dayValue(entries, routine.id, date);
                const label = `${fmtDayFull(date)} — ${routine.name}: ${STATE_WORD[state]}${val ? `, ${val}` : ''}`;
                return (
                  <button
                    key={date}
                    role="gridcell"
                    className={cx('step mx-auto w-[26px]', isCurrent && d === play && 'step--play', isCurrent && d === todayInWeek && 'step--now')}
                    aria-label={label}
                    title={label}
                    onClick={() => onDay(date)}
                  >
                    <Pad state={state} accent={routine.accent} size={20} />
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function dayValue(entries: Record<string, Entry>, routineId: string, date: ISODate): string {
  const es = Object.values(entries).filter((e) => e.routineId === routineId && e.date === date);
  if (!es.length) return '';
  const total = es.reduce((s, e) => s + e.value, 0);
  return `${es.length > 1 ? `${es.length}×, ` : ''}${total}`;
}

// ── The ledger equivalent — same range as a plain table ──────────────────────

function RoutineLedger({
  routine,
  endWeek,
  weeks,
  onOpen,
}: {
  routine: Routine;
  endWeek: ISODate;
  weeks: number;
  onOpen: () => void;
}) {
  const entries = useRegister((s) => s.entries);
  const exceptions = useRegister((s) => s.exceptions);
  const today = todayISO();

  const rows: { date: ISODate; state: DayState; value: string }[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const ws = addDaysISO(endWeek, -7 * w);
    for (let d = 0; d < 7; d++) {
      const date = addDaysISO(ws, d);
      if (diffDaysISO(date, today) > 0) continue;
      if (!isScheduled(routine, date)) continue;
      const state = dayState(routine, date, entries, exceptions, today);
      rows.push({ date, state, value: dayValue(entries, routine.id, date) });
    }
  }
  rows.reverse();

  return (
    <section className="mb-6" aria-label={`${routine.name} — day ledger`}>
      <button onClick={onOpen} className="disp mb-1.5 block text-[14px] hover:underline">
        {routine.name}
      </button>
      <table className="w-full max-w-xl text-left text-[12px]">
        <thead>
          <tr className="border-b border-rule-dark">
            <th className="kicker py-1 pr-3 font-semibold">Day</th>
            <th className="kicker py-1 pr-3 font-semibold">Step</th>
            <th className="kicker py-1 font-semibold">Logged</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 60).map((r) => (
            <tr key={r.date} className="chan">
              <td className="mono py-1 pr-3 text-[11px]">{fmtDayFull(r.date)}</td>
              <td className="py-1 pr-3">
                <span className="flex items-center gap-1.5">
                  <Pad state={r.state} accent={routine.accent} size={16} />
                  {STATE_WORD[r.state]}
                </span>
              </td>
              <td className="mono py-1 text-[11px] text-ink-soft">{r.value || '—'}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} className="py-3 text-ink-faint">
                No scheduled days in this range.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {rows.length > 60 && <p className="mt-1 mono text-[10px] text-ink-faint">…{rows.length - 60} earlier days in range</p>}
    </section>
  );
}

// ── Day sheet — one cell's evidence ──────────────────────────────────────────

function DaySheet({ routine, date, onClose }: { routine: Routine; date: ISODate; onClose: () => void }) {
  const entries = useRegister((s) => s.entries);
  const events = useRegister((s) => s.events);
  const exceptions = useRegister((s) => s.exceptions);
  const friction = useRegister((s) => s.friction);
  const settings = useRegister((s) => s.settings);
  const addException = useRegister((s) => s.addException);

  const dayEntries = Object.values(entries).filter((e) => e.routineId === routine.id && e.date === date);
  const dayFriction = Object.values(friction).filter((f) => f.routineId === routine.id && f.date === date);
  const ex = exceptionFor(exceptions, routine.id, date);
  const state = dayState(routine, date, entries, exceptions, date);

  return (
    <Sheet title={`${fmtDayFull(date)} — ${routine.name}`} onClose={onClose}>
      <div className="mb-4 flex items-center gap-2">
        <Pad state={state} accent={routine.accent} size={30} />
        <span className="disp text-[15px]">{STATE_WORD[state]}</span>
      </div>

      {dayEntries.length > 0 && (
        <div className="mb-4">
          <div className="kicker mb-1">Entries</div>
          {dayEntries.map((e) => {
            const ev = e.eventId ? events[e.eventId] : undefined;
            const evUrl = ev ? evidenceUrl(ev, settings) : null;
            return (
              <div key={e.id} className="chan flex items-baseline justify-between gap-2 py-1.5 text-[12.5px]">
                <span className="mono">
                  {e.value} {routine.measure === 'duration' ? 'min' : routine.unit || ''}
                  {e.isMinimum ? ' · minimum' : ''}
                </span>
                {/* UX-TRACKER #70 — provenance badge: an event-derived entry
                    names the app that logged it (Entry.eventId → sourceApp) */}
                <span className="mono text-[10px] uppercase text-ink-faint">
                  {e.source === 'event' ? (
                    evUrl ? (
                      <a href={evUrl} target="_blank" rel="noreferrer" className="underline">
                        {ev ? `from ${APP_DISPLAY[ev.sourceApp] ?? 'other'} · ${ev.type}` : 'event'}
                      </a>
                    ) : (
                      ev ? `from ${APP_DISPLAY[ev.sourceApp] ?? 'other'} · ${ev.type}` : 'event'
                    )
                  ) : (
                    'manual'
                  )}
                </span>
              </div>
            );
          })}
          {dayEntries.some((e) => e.note) && (
            <div className="mt-1 text-[12px] italic text-ink-soft">
              {dayEntries.filter((e) => e.note).map((e) => e.note).join(' — ')}
            </div>
          )}
        </div>
      )}

      {dayFriction.length > 0 && (
        <div className="mb-4">
          <div className="kicker mb-1">Friction</div>
          {dayFriction.map((f) => (
            <div key={f.id} className="chan py-1.5 text-[12.5px]">
              {FRICTION_LABEL[f.kind] ?? f.kind}
              {f.note && <span className="text-ink-soft"> — {f.note}</span>}
            </div>
          ))}
        </div>
      )}

      {ex && (
        <div className="mb-4 text-[12.5px]">
          <span className="kicker mr-2">Exception</span>
          {EXCEPTION_LABEL[ex.kind]}
          {ex.note && <span className="text-ink-soft"> — {ex.note}</span>}
        </div>
      )}

      {!ex && diffDaysISO(new Date().toISOString().slice(0, 10), date) >= 0 && (
        <button
          className="btn btn--quiet"
          onClick={() => {
            addException({ routineId: routine.id, date, kind: 'other' });
            onClose();
          }}
        >
          Mute this day — an exception
        </button>
      )}
    </Sheet>
  );
}
