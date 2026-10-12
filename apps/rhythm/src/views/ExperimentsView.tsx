// ── Experiments — gentle, dated, reversible ──────────────────────────────────
// "For two weeks, review cards before dinner." A hypothesis, a date range, a
// routine under test. While it runs the band reads EXPERIMENTING — judgment is
// suspended, not the record. At the end the register lays the before/after side
// by side and the student writes the outcome.

import { useEffect, useMemo, useState } from 'react';
import { useRegister } from '../store';
import type { Experiment } from '../lib/types';
import { routineWeek } from '../lib/register';
import { addDaysISO, diffDaysISO, fmtDay, todayISO, weekStartISO } from '../lib/dates';
import { Field } from '../components/Field';
import { Sheet } from '../components/Sheet';
import { Lamp } from '../components/Lamp';

export function ExperimentsView({ focusId }: { focusId?: string | null }) {
  const s = useRegister();
  const [open, setOpen] = useState(false);
  const [outcomeFor, setOutcomeFor] = useState<string | null>(null);
  const [outcome, setOutcome] = useState('');

  /* ?experiment=<id> — scroll the named card into view and light it; an
     unknown id simply finds no card (silent plain list). */
  useEffect(() => {
    if (!focusId) return;
    const el = document.querySelector(`[data-experiment-id="${CSS.escape(focusId)}"]`);
    el?.scrollIntoView({ block: 'center', behavior: s.settings.motion === 'reduced' ? 'auto' : 'smooth' });
  }, [focusId, s.settings.motion]);

  const experiments = Object.values(s.experiments).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const active = experiments.filter((e) => e.status === 'active');
  const finished = experiments.filter((e) => e.status !== 'active');

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker mb-1">Experiments</div>
          <h1 className="disp text-2xl">Test one change at a time</h1>
          <p className="mt-1 max-w-lg text-[12.5px] leading-snug text-ink-soft">
            An experiment changes one thing, for a fixed window, then reports back. It is a pencil
            note in the margin — the routine's record is untouched.
          </p>
        </div>
        <button className="btn btn--primary" onClick={() => setOpen(true)}>
          New experiment
        </button>
      </div>

      {experiments.length === 0 && (
        <div className="py-10 text-center">
          <p className="disp text-lg text-ink-soft">No experiments on file.</p>
          <p className="mt-1 text-sm text-ink-faint">
            When a routine feels off, test a change for two weeks instead of guessing.
          </p>
        </div>
      )}

      {active.length > 0 && (
        <section className="mb-6" aria-label="active experiments">
          <div className="kicker mb-2">Running</div>
          {active.map((e) => (
            <ExperimentCard key={e.id} experiment={e} focused={e.id === focusId} onResolve={(status) => {
              if (status === 'completed') {
                setOutcome('');
                setOutcomeFor(e.id);
              } else {
                s.resolveExperiment(e.id, 'abandoned');
              }
            }} />
          ))}
        </section>
      )}

      {finished.length > 0 && (
        <section aria-label="finished experiments">
          <div className="kicker mb-2">Filed</div>
          <div className="border-y border-rule">
            {finished.map((e) => (
              <div
                key={e.id}
                className="chan px-2 py-2.5"
                data-experiment-id={e.id}
                style={e.id === focusId ? { outline: '2px solid var(--color-indigo)', outlineOffset: '1px' } : undefined}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="disp text-[14px]">{s.routines[e.routineId]?.name ?? 'archived routine'}</span>
                  <span className="mono text-[10px] uppercase text-ink-faint">
                    {fmtDay(e.startDate)} – {fmtDay(e.endDate)} · {e.status}
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] italic text-ink-soft">"{e.hypothesis}"</p>
                <p className="text-[12px] text-ink-soft">change: {e.change}</p>
                {e.outcome && <p className="mt-1 text-[12.5px]">outcome: {e.outcome}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {open && <NewExperimentSheet onClose={() => setOpen(false)} />}

      {outcomeFor && (
        <Sheet title="File the outcome" onClose={() => setOutcomeFor(null)}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              s.resolveExperiment(outcomeFor, 'completed', outcome);
              setOutcomeFor(null);
            }}
          >
            <Field label="What did the two weeks show?">
              <textarea
                className="f-textarea"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                placeholder="e.g. hit the target both weeks — keeping cards before dinner"
                autoFocus
              />
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn--quiet" onClick={() => setOutcomeFor(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary" disabled={!outcome.trim()}>
                File outcome
              </button>
            </div>
          </form>
        </Sheet>
      )}
    </div>
  );
}

function ExperimentCard({ experiment: e, focused, onResolve }: { experiment: Experiment; focused?: boolean; onResolve: (status: 'completed' | 'abandoned') => void }) {
  const s = useRegister();
  const today = todayISO();
  const routine = s.routines[e.routineId];

  const compare = useMemo(() => {
    if (!routine) return null;
    const days = diffDaysISO(e.endDate, e.startDate) + 1;
    // weeks touched by the experiment vs the same number of weeks before it
    const expWeeks = new Set<string>();
    for (let d = 0; d < days; d++) {
      expWeeks.add(weekStartISO(addDaysISO(e.startDate, d), s.settings.weekStartsOn));
    }
    const before: string[] = [];
    let cursor = addDaysISO(e.startDate, -7);
    for (let i = 0; i < expWeeks.size; i++) {
      before.unshift(cursor);
      cursor = addDaysISO(cursor, -7);
    }
    const rate = (starts: string[]) =>
      starts
        .map((w) => routineWeek(routine, w, s.entries, s.exceptions, today, s.settings.weekStartsOn))
        .filter((w) => !w.exempt);
    const during = rate([...expWeeks]);
    const prior = rate(before);
    return {
      duringHit: during.filter((w) => w.hit).length,
      duringN: during.length,
      priorHit: prior.filter((w) => w.hit).length,
      priorN: prior.length,
    };
  }, [routine, e, s.entries, s.exceptions, s.settings.weekStartsOn, today]);

  const daysLeft = diffDaysISO(e.endDate, today);
  const overdue = daysLeft < 0;

  return (
    <div
      className="panel mb-3 p-4"
      data-experiment-id={e.id}
      style={focused ? { outline: '2px solid var(--color-indigo)', outlineOffset: '2px' } : undefined}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="disp text-[15px]">{routine?.name ?? 'archived routine'}</span>
            <Lamp band="experimenting" />
          </div>
          <p className="mt-1 max-w-md text-[12.5px] italic text-ink-soft">"{e.hypothesis}"</p>
          <p className="text-[12px] text-ink-soft">testing: {e.change}</p>
        </div>
        <div className="text-right">
          <div className="mono text-[11px] text-ink-soft">
            {fmtDay(e.startDate)} – {fmtDay(e.endDate)}
          </div>
          <div className="mono text-[10px] uppercase text-ink-faint">
            {overdue ? `${-daysLeft}d past the window` : `${daysLeft}d left`}
          </div>
        </div>
      </div>
      {compare && (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-rule pt-2 mono text-[11.5px]">
          <span>
            before: <b>{compare.priorHit}/{compare.priorN}</b> weeks on target
          </span>
          <span>
            during: <b>{compare.duringHit}/{compare.duringN}</b> weeks on target
          </span>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <button className="btn btn--primary" onClick={() => onResolve('completed')}>
          Conclude — file outcome
        </button>
        <button className="btn btn--quiet" onClick={() => onResolve('abandoned')}>
          Abandon
        </button>
      </div>
    </div>
  );
}

function NewExperimentSheet({ onClose }: { onClose: () => void }) {
  const s = useRegister();
  const routines = Object.values(s.routines).filter((r) => r.status === 'active');
  const today = todayISO();
  const [routineId, setRoutineId] = useState(routines[0]?.id ?? '');
  const [hypothesis, setHypothesis] = useState('');
  const [change, setChange] = useState('');
  const [weeks, setWeeks] = useState(2);

  return (
    <Sheet title="New experiment" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!routineId || !hypothesis.trim() || !change.trim()) return;
          s.addExperiment({
            routineId,
            hypothesis,
            change,
            startDate: today,
            endDate: addDaysISO(today, weeks * 7 - 1),
          });
          onClose();
        }}
      >
        <Field label="Routine under test">
          <select className="f-select" value={routineId} onChange={(e) => setRoutineId(e.target.value)}>
            {routines.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Hypothesis" hint="what you expect to happen, in one line">
          <textarea
            className="f-textarea"
            value={hypothesis}
            onChange={(e) => setHypothesis(e.target.value)}
            placeholder="e.g. reviewing cards before dinner will make the weekly target easier"
            autoFocus
          />
        </Field>
        <Field label="The one change">
          <input
            className="f-input"
            value={change}
            onChange={(e) => setChange(e.target.value)}
            placeholder="e.g. cards before dinner instead of before bed"
          />
        </Field>
        <Field label="Window">
          <select className="f-select" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
            <option value={1}>1 week</option>
            <option value={2}>2 weeks</option>
            <option value={3}>3 weeks</option>
            <option value={4}>4 weeks</option>
          </select>
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn--quiet" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={!routineId || !hypothesis.trim() || !change.trim()}
          >
            Start experiment
          </button>
        </div>
      </form>
    </Sheet>
  );
}
