// ── Routine detail — one behavior under inspection ──────────────────────────
// Target, this week's strip, honest stats, recurring friction, connected
// events, exceptions, and the full entry ledger. Pause and archive live here —
// never as punishment, always reversible.

import { useMemo, useState } from 'react';
import { useRegister } from '../store';
import type { Entry, Routine, RoutineAccent } from '../lib/types';
import { bandFor, BAND_NOTE } from '../lib/bands';
import { completedWeekStarts, dayState, routineWeek } from '../lib/register';
import {
  addDaysISO,
  dateOfInstant,
  fmtDay,
  fmtDayFull,
  fmtMinutes,
  fmtTime,
  todayISO,
  weekStartISO,
} from '../lib/dates';
import { cx, EXCEPTION_LABEL, FRICTION_LABEL, WEEKDAY_NAMES } from '../lib/utils';
import { usePlayhead } from '../lib/playhead';
import { Pad } from '../components/Pad';
import { Lamp } from '../components/Lamp';
import { Sheet } from '../components/Sheet';
import { Field } from '../components/Field';
import { evidenceUrl } from '../lib/links';

export function RoutineView({ routineId }: { routineId: string }) {
  const s = useRegister();
  const r = s.routines[routineId];
  const today = todayISO();
  const [editOpen, setEditOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState('');

  const band = useMemo(
    () => (r ? bandFor(r, s.entries, s.exceptions, s.experiments, today, s.settings.weekStartsOn) : null),
    [r, s.entries, s.exceptions, s.experiments, today, s.settings.weekStartsOn],
  );

  if (!r) {
    return <p className="py-10 text-center text-ink-faint">That channel is no longer patched in.</p>;
  }

  const weekDates = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStartISO(today, s.settings.weekStartsOn), i));
  const play = usePlayhead(s.settings.motion === 'full');
  const myEntries = Object.values(s.entries)
    .filter((e) => e.routineId === r.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const myFriction = Object.values(s.friction)
    .filter((f) => f.routineId === r.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const myExceptions = Object.values(s.exceptions)
    .filter((e) => e.routineId === r.id || e.routineId === 'all')
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const myMappings = Object.values(s.mappings).filter((m) => m.routineId === r.id);
  const myEvents = Object.values(s.events)
    .filter((ev) => myEntries.some((e) => e.eventId === ev.id))
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
    .slice(0, 8);

  // honest stats — no streaks, no totals dressed as mastery
  const weekHistory = completedWeekStarts(r, today, s.settings.weekStartsOn)
    .map((w) => routineWeek(r, w, s.entries, s.exceptions, today, s.settings.weekStartsOn))
    .filter((w) => !w.exempt);
  const hits = weekHistory.filter((w) => w.hit).length;
  const durations = r.measure === 'duration' ? myEntries.map((e) => e.value) : [];
  const avgDuration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;
  const frictionCounts = myFriction.reduce<Record<string, number>>((acc, f) => {
    acc[f.kind] = (acc[f.kind] ?? 0) + 1;
    return acc;
  }, {});
  const topFriction = Object.entries(frictionCounts).sort((a, b) => b[1] - a[1]);

  const unitLabel = r.measure === 'duration' ? 'min' : r.unit || r.measure;

  return (
    <div>
      {/* ── Heading block ────────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="kicker mb-1">Routine detail — since {fmtDay(dateOfInstant(r.createdAt))}</div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="disp text-2xl">{r.name}</h1>
            {band && <Lamp band={band.band} />}
          </div>
          {band && <p className="mt-1 max-w-md text-[12px] text-ink-soft">{BAND_NOTE[band.band]}</p>}
        </div>
        <div className="flex flex-wrap gap-2 no-print">
          <button className="btn btn--quiet" onClick={() => setEditOpen(true)}>
            Edit
          </button>
          {r.status === 'active' ? (
            <button
              className="btn btn--quiet"
              onClick={() => {
                setPauseReason('');
                setPauseOpen(true);
              }}
            >
              Pause
            </button>
          ) : r.status === 'paused' ? (
            <button className="btn btn--primary" onClick={() => s.resumeRoutine(r.id)}>
              Resume
            </button>
          ) : null}
          {r.status !== 'archived' && (
            <button
              className="btn btn--danger"
              onClick={() => {
                if (window.confirm(`Archive "${r.name}"? Its history stays on the tape but it leaves Today.`)) {
                  s.archiveRoutine(r.id);
                }
              }}
            >
              Archive
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── Target card ─────────────────────────────────────────── */}
        <section className="panel p-4" aria-label="target">
          <div className="kicker mb-2">The part</div>
          <dl className="space-y-1.5 text-[13px]">
            <Row k="Measures">
              {r.measure === 'check' ? 'showing up' : r.measure}
              {r.measure !== 'check' && r.unit ? ` (${r.unit})` : ''}
            </Row>
            <Row k="Weekly target">
              {r.measure === 'check'
                ? `${r.target.perWeek} day${r.target.perWeek === 1 ? '' : 's'}`
                : `${r.target.perWeek} ${unitLabel}`}
            </Row>
            {r.target.perDay && (
              <Row k="A full day">
                ≥ {r.target.perDay} {unitLabel}
              </Row>
            )}
            <Row k="On">
              {r.weekdays.length === 0
                ? 'any day'
                : [...r.weekdays].sort((a, b) => a - b).map((d) => WEEKDAY_NAMES[d]).join(' · ')}
            </Row>
            {r.minimum && (
              <Row k="Minimum version">
                {r.minimum.label}
                {r.minimum.perWeek ? ` — ${r.minimum.perWeek}×/wk counts` : ''}
              </Row>
            )}
            {r.windowStart && r.windowEnd && (
              <Row k="Window">
                {fmtTime(r.windowStart)} – {fmtTime(r.windowEnd)}
              </Row>
            )}
          </dl>
        </section>

        {/* ── This measure + history stats ────────────────────────── */}
        <section className="panel p-4" aria-label="record">
          <div className="kicker mb-2">This measure</div>
          <div className="mb-3 grid grid-cols-7 gap-1">
            {weekDates.map((d, i) => {
              const state = dayState(r, d, s.entries, s.exceptions, today);
              return (
                <div key={d} className={cx('flex flex-col items-center gap-0.5 rounded-[3px] py-0.5', i === play && 'step--play', d === today && 'step--now')}>
                  <Pad state={state} accent={r.accent} size={24} title={`${fmtDayFull(d)} — ${state}`} />
                  <span className="mono text-[8.5px] uppercase text-ink-faint">{fmtDay(d)}</span>
                </div>
              );
            })}
          </div>
          <dl className="space-y-1.5 text-[13px]">
            <Row k="Weeks judged">{weekHistory.length}</Row>
            <Row k="Targets met">{hits}</Row>
            <Row k="Sessions logged">{myEntries.length}</Row>
            {avgDuration !== null && <Row k="Average session">{fmtMinutes(avgDuration)}</Row>}
          </dl>
        </section>

        {/* ── Friction — the recurring barriers ───────────────────── */}
        <section className="panel p-4" aria-label="friction">
          <div className="kicker mb-2">Common friction</div>
          {topFriction.length === 0 ? (
            <p className="text-[12.5px] text-ink-faint">
              Nothing logged. When a day doesn't happen, the reason goes here — patterns beat
              willpower.
            </p>
          ) : (
            <>
              {topFriction.map(([kind, n]) => (
                <div key={kind} className="chan flex items-center justify-between py-1.5 text-[13px]">
                  <span>{FRICTION_LABEL[kind] ?? kind}</span>
                  <span className="mono text-[11px] text-ink-soft">×{n}</span>
                </div>
              ))}
              {myFriction.filter((f) => f.note).slice(0, 3).map((f) => (
                <p key={f.id} className="mt-2 text-[11.5px] italic text-ink-soft">
                  "{f.note}" <span className="mono not-italic text-[9.5px]">{fmtDay(f.date)}</span>
                </p>
              ))}
            </>
          )}
        </section>

        {/* ── Connections + exceptions ────────────────────────────── */}
        <section className="panel p-4" aria-label="connections">
          <div className="kicker mb-2">Connected events</div>
          {myMappings.length === 0 ? (
            <p className="text-[12.5px] text-ink-faint">
              No routings yet. Wire suite signals from the Signal-in tab — a finished Timer session
              can hit this channel itself.
            </p>
          ) : (
            <>
              {myMappings.map((m) => (
                <div key={m.id} className="chan flex items-center justify-between py-1.5 text-[12.5px]">
                  <span className="mono text-[11.5px]">{m.eventType}</span>
                  <span className="mono text-[10px] uppercase text-ink-faint">
                    {m.valueRule}
                    {m.metricKey ? `:${m.metricKey}` : ''} {m.enabled ? '' : '· off'}
                  </span>
                </div>
              ))}
              {myEvents.length > 0 && (
                <div className="mt-3">
                  <div className="kicker mb-1">Recent evidence</div>
                  {myEvents.map((ev) => {
                    const url = evidenceUrl(ev, s.settings);
                    return (
                      <div key={ev.id} className="chan flex items-center justify-between py-1 text-[12px]">
                        <span className="mono text-[11px]">{fmtDay(dateOfInstant(ev.occurredAt))}</span>
                        {url ? (
                          <a className="mono text-[11px] text-indigo underline" href={url} target="_blank" rel="noreferrer">
                            {ev.type}
                          </a>
                        ) : (
                          <span className="mono text-[11px] text-ink-soft">{ev.type}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {myExceptions.length > 0 && (
            <div className="mt-4">
              <div className="kicker mb-1">Exceptions on record</div>
              {myExceptions.slice(0, 6).map((e) => (
                <div key={e.id} className="chan flex items-center justify-between py-1 text-[12px]">
                  <span className="mono text-[11px]">{fmtDay(e.date)}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-ink-soft">
                      {EXCEPTION_LABEL[e.kind]}
                      {e.note ? ` — ${e.note}` : ''}
                    </span>
                    <button
                      className="mono text-[10px] uppercase text-ink-faint underline"
                      onClick={() => s.removeException(e.id)}
                    >
                      cut
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── The tape — every hit stays ───────────────────────────── */}
      <section className="mt-6" aria-label="the tape">
        <div className="kicker mb-2">The tape — every hit stays</div>
        <div className="border-y border-rule">
          {myEntries.length === 0 && (
            <p className="py-4 text-[12.5px] text-ink-faint">Nothing recorded yet. Today is a fine first hit.</p>
          )}
          {myEntries.slice(0, 30).map((e) => (
            <EntryRow key={e.id} entry={e} routine={r} onRemove={() => s.removeEntry(e.id)} />
          ))}
          {myEntries.length > 30 && (
            <p className="py-2 mono text-[10px] text-ink-faint">…{myEntries.length - 30} earlier hits kept on the tape</p>
          )}
        </div>
      </section>

      {editOpen && <EditSheet routine={r} onClose={() => setEditOpen(false)} />}

      {pauseOpen && (
        <Sheet title={`Pause "${r.name}"`} onClose={() => setPauseOpen(false)}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              s.pauseRoutine(r.id, pauseReason || undefined);
              setPauseOpen(false);
            }}
          >
            <p className="text-[12px] leading-snug text-ink-soft">
              Muting a channel suspends judgment, not history. Every earlier hit stays on the tape.
            </p>
            <Field label="Why pause (optional, private)">
              <input
                className="f-input"
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                placeholder="e.g. finals week, traveling"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn--quiet" onClick={() => setPauseOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary">
                Mute channel
              </button>
            </div>
          </form>
        </Sheet>
      )}
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="mono text-[10.5px] uppercase tracking-wide text-ink-faint">{k}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function EntryRow({ entry: e, routine, onRemove }: { entry: Entry; routine: Routine; onRemove: () => void }) {
  return (
    <div className="chan flex items-center gap-3 px-2 py-1.5">
      <Pad state={e.isMinimum ? 'minimum' : 'full'} accent={routine.accent} size={20} />
      <span className="mono text-[11px]">{fmtDayFull(e.date)}</span>
      <span className="mono flex-1 text-[11.5px] text-ink-soft">
        {routine.measure === 'check' ? (e.isMinimum ? 'minimum' : 'showed up') : `${e.value} ${routine.measure === 'duration' ? 'min' : routine.unit || ''}`}
        {e.context ? ` · ${e.context}` : ''}
      </span>
      {e.note && <span className="max-w-40 truncate text-[11px] italic text-ink-faint">{e.note}</span>}
      <span className="mono text-[9.5px] uppercase text-ink-faint">{e.source}</span>
      <button className="mono text-[10px] uppercase text-ink-faint underline" onClick={onRemove} title="cut this hit from the tape">
        cut
      </button>
    </div>
  );
}

// ── Edit sheet ───────────────────────────────────────────────────────────────

const ACCENTS: RoutineAccent[] = ['indigo', 'oxblood', 'hunter', 'ochre', 'plum', 'teal', 'slate', 'rust'];

export function EditSheet({ routine, onClose }: { routine: Routine; onClose: () => void }) {
  const updateRoutine = useRegister((s) => s.updateRoutine);
  const courses = useRegister((s) => s.courses);
  const [name, setName] = useState(routine.name);
  const [unit, setUnit] = useState(routine.unit ?? '');
  const [perWeek, setPerWeek] = useState(String(routine.target.perWeek));
  const [perDay, setPerDay] = useState(routine.target.perDay ? String(routine.target.perDay) : '');
  const [weekdays, setWeekdays] = useState<number[]>(routine.weekdays);
  const [minLabel, setMinLabel] = useState(routine.minimum?.label ?? '');
  const [minPerWeek, setMinPerWeek] = useState(routine.minimum?.perWeek ? String(routine.minimum.perWeek) : '');
  const [windowStart, setWindowStart] = useState(routine.windowStart ?? '');
  const [windowEnd, setWindowEnd] = useState(routine.windowEnd ?? '');
  const [accent, setAccent] = useState<RoutineAccent>(routine.accent);
  const [courseId, setCourseId] = useState(routine.courseId ?? '');

  const toggleDay = (d: number) =>
    setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]));

  return (
    <Sheet title={`Edit — ${routine.name}`} onClose={onClose} wide>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          updateRoutine(routine.id, {
            name: name.trim() || routine.name,
            unit: unit.trim() || undefined,
            target: {
              perWeek: Math.max(1, Math.round(Number(perWeek) || 1)),
              perDay: perDay ? Math.max(1, Math.round(Number(perDay))) : undefined,
            },
            weekdays,
            minimum: minLabel.trim()
              ? { label: minLabel.trim(), perWeek: minPerWeek ? Math.max(1, Math.round(Number(minPerWeek))) : undefined }
              : undefined,
            windowStart: windowStart || undefined,
            windowEnd: windowEnd || undefined,
            accent,
            courseId: courseId || undefined,
          });
          onClose();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input className="f-input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={routine.measure === 'check' ? 'Days per week' : `Target per week (${unit || 'units'})`}>
            <input className="f-input" inputMode="numeric" value={perWeek} onChange={(e) => setPerWeek(e.target.value)} />
          </Field>
          {routine.measure !== 'check' && (
            <>
              <Field label="Unit label (cards, pages…)" hint={routine.measure === 'duration' ? 'durations are always minutes' : undefined}>
                <input className="f-input" value={unit} onChange={(e) => setUnit(e.target.value)} disabled={routine.measure === 'duration'} />
              </Field>
              <Field label="Full-day amount (optional)">
                <input className="f-input" inputMode="numeric" value={perDay} onChange={(e) => setPerDay(e.target.value)} />
              </Field>
            </>
          )}
          <Field label="Course (optional)">
            <select className="f-select" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">none</option>
              {Object.values(courses).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code || c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Minimum version label" hint="the smallest version that still counts">
            <input className="f-input" value={minLabel} onChange={(e) => setMinLabel(e.target.value)} placeholder="e.g. open the deck" />
          </Field>
          <Field label="Minimum days/week (optional)">
            <input className="f-input" inputMode="numeric" value={minPerWeek} onChange={(e) => setMinPerWeek(e.target.value)} />
          </Field>
          <Field label="Window start (optional)">
            <input className="f-input" type="time" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} />
          </Field>
          <Field label="Window end">
            <input className="f-input" type="time" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} />
          </Field>
        </div>

        <Field label="Scheduled days (none chosen = any day)">
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <button
                key={d}
                type="button"
                className={cx('btn !px-2.5 !py-1', weekdays.includes(d) ? 'btn--primary' : 'btn--quiet')}
                aria-pressed={weekdays.includes(d)}
                onClick={() => toggleDay(d)}
              >
                {WEEKDAY_NAMES[d]}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Channel LED">
          <div className="flex flex-wrap gap-1.5">
            {ACCENTS.map((a) => (
              <button
                key={a}
                type="button"
                aria-label={`accent ${a}`}
                aria-pressed={accent === a}
                onClick={() => setAccent(a)}
                className={cx('h-6 w-6 rounded-full border-2', accent === a ? 'border-ink' : 'border-transparent')}
                style={{ background: `var(--color-acc-${a})` }}
              />
            ))}
          </div>
        </Field>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn--quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary">
            Save
          </button>
        </div>
      </form>
    </Sheet>
  );
}
