// ── Routine intake form — shared by Onboarding and "add a routine" ──────────

import { useState } from 'react';
import { useRegister } from '../store';
import type { RoutineMeasure } from '../lib/types';
import { cx, WEEKDAY_NAMES } from '../lib/utils';
import { Field } from './Field';

const MEASURES: { key: RoutineMeasure; label: string; hint: string }[] = [
  { key: 'check', label: 'Showed up', hint: 'a step sounds when you did it' },
  { key: 'count', label: 'Sessions', hint: 'how many hits per week' },
  { key: 'duration', label: 'Time', hint: 'minutes per week' },
  { key: 'quantity', label: 'Amount', hint: 'cards, pages, problems…' },
];

export function RoutineForm({
  submitLabel = 'Patch it in',
  onDone,
  autofocusName,
}: {
  submitLabel?: string;
  onDone?: () => void;
  autofocusName?: boolean;
}) {
  const addRoutine = useRegister((s) => s.addRoutine);
  const courses = useRegister((s) => s.courses);
  const [name, setName] = useState('');
  const [measure, setMeasure] = useState<RoutineMeasure>('check');
  const [unit, setUnit] = useState('');
  const [perWeek, setPerWeek] = useState('3');
  const [perDay, setPerDay] = useState('');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [minLabel, setMinLabel] = useState('');
  const [windowStart, setWindowStart] = useState('');
  const [windowEnd, setWindowEnd] = useState('');
  const [courseId, setCourseId] = useState('');

  const toggleDay = (d: number) => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]));
  const valid = name.trim().length > 0 && Number(perWeek) >= 1;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        addRoutine({
          name: name.trim(),
          measure,
          unit: measure === 'quantity' || measure === 'count' ? unit.trim() || undefined : undefined,
          perWeek: Math.max(1, Math.round(Number(perWeek))),
          perDay: perDay ? Math.max(1, Math.round(Number(perDay))) : undefined,
          weekdays,
          minimumLabel: minLabel.trim() || undefined,
          courseId: courseId || undefined,
          windowStart: windowStart || undefined,
          windowEnd: windowEnd || undefined,
        });
        setName('');
        onDone?.();
      }}
    >
      <Field label="Routine name">
        <input
          className="f-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Focus session, Review cards, Read for History"
          autoFocus={autofocusName}
        />
      </Field>

      <Field label="What counts">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {MEASURES.map((m) => (
            <button
              key={m.key}
              type="button"
              className={cx('btn !px-2 !py-1.5 !normal-case !tracking-normal !font-ui text-[12px]', measure === m.key ? 'btn--primary' : 'btn--quiet')}
              aria-pressed={measure === m.key}
              title={m.hint}
              onClick={() => setMeasure(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={measure === 'check' ? 'Days per week' : 'Target per week'}>
          <input className="f-input" inputMode="numeric" value={perWeek} onChange={(e) => setPerWeek(e.target.value)} />
        </Field>
        {(measure === 'quantity' || measure === 'count') && (
          <Field label="Unit (cards, pages…)">
            <input className="f-input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="cards" />
          </Field>
        )}
        {measure !== 'check' && (
          <Field label="Full-day amount (optional)" hint="a day's bar for the step grid">
            <input className="f-input" inputMode="numeric" value={perDay} onChange={(e) => setPerDay(e.target.value)} />
          </Field>
        )}
        {Object.keys(courses).length > 0 && (
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
        )}
        <Field label="Minimum version (optional)" hint="the smallest version that still counts">
          <input className="f-input" value={minLabel} onChange={(e) => setMinLabel(e.target.value)} placeholder="e.g. open the deck" />
        </Field>
        <Field label="Quiet window (optional)" hint="a time range, never an alarm">
          <div className="flex items-center gap-2">
            <input className="f-input" type="time" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} aria-label="window start" />
            <span className="mono text-[11px] text-ink-faint">–</span>
            <input className="f-input" type="time" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} aria-label="window end" />
          </div>
        </Field>
      </div>

      <Field label="Scheduled days (none = any day)">
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

      <div className="flex justify-end">
        <button type="submit" className="btn btn--primary" disabled={!valid}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
