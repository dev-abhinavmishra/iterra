// ── Weekly review — the register closes a week ───────────────────────────────
// A calm scorecard, not a verdict. Confirm what happened, answer one prompt,
// choose one adjustment. Past reviews file into the ledger.

import { useEffect, useMemo, useState } from 'react';
import { useRegister } from '../store';
import { bandFor } from '../lib/bands';
import { weeklyScorecard } from '../lib/register';
import { addDaysISO, diffDaysISO, fmtDay, fmtMinutes, fmtWeekRange, todayISO, weekStartISO } from '../lib/dates';
import { Pad } from '../components/Pad';
import { Lamp } from '../components/Lamp';
import { Field } from '../components/Field';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cx } from '../lib/utils';

const PROMPTS = [
  'What made the missed days hard — and what would have made them easier?',
  'Which routine earned its place this week, and which one is asking to be resized?',
  'Where did the week actually go, compared to where the machine expected it to go?',
  'What is the smallest version of the weakest routine that still counts?',
  'Which day was the honest outlier, and what made it different?',
];

export function ReviewView({ openRoutine }: { openRoutine: (id: string) => void }) {
  const s = useRegister();
  const today = todayISO();

  const currentWeek = weekStartISO(today, s.settings.weekStartsOn);
  const lastCompleted = addDaysISO(currentWeek, -7);
  const [weekStart, setWeekStart] = useState(lastCompleted);
  const canNext = diffDaysISO(weekStart, lastCompleted) < 0;

  const routines = Object.values(s.routines).filter((r) => r.status !== 'archived');
  const card = weeklyScorecard(routines, weekStart, s.entries, s.exceptions, today, s.settings.weekStartsOn);
  const reviewed = s.reviews[weekStart];

  const prompt = useMemo(() => {
    const n = Math.abs(weekStart.split('').reduce((a, c) => a + c.charCodeAt(0), 0));
    return PROMPTS[n % PROMPTS.length];
  }, [weekStart]);

  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [reflection, setReflection] = useState('');
  const [adjustment, setAdjustment] = useState('');
  const [filed, setFiled] = useState(false);

  /* The composer belongs to one measure — turning the page must reset it,
     or the "Cut." receipt for week A would dead-end the form for week B. */
  useEffect(() => {
    setConfirmed([]);
    setReflection('');
    setAdjustment('');
    setFiled(false);
  }, [weekStart]);

  const weeksWithHistory = useMemo(
    () =>
      Object.values(s.reviews)
        .map((r) => r.weekStart)
        .sort()
        .reverse(),
    [s.reviews],
  );

  return (
    <div>
      {/* ── Week nav — pages turn ─────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="kicker mb-1">Weekly review</div>
          <h1 className="disp text-2xl">Week of {fmtWeekRange(weekStart)}</h1>
          {diffDaysISO(weekStart, currentWeek) >= 0 && (
            <p className="mt-0.5 text-[11.5px] italic text-ink-soft">This measure is still playing — the scorecard is provisional.</p>
          )}
        </div>
        <div className="flex items-center gap-1 no-print">
          <button className="btn btn--quiet !px-2" onClick={() => setWeekStart(addDaysISO(weekStart, -7))} aria-label="earlier week">
            <ChevronLeft size={13} />
          </button>
          <button className="btn btn--quiet !px-2" onClick={() => canNext && setWeekStart(addDaysISO(weekStart, 7))} disabled={!canNext} aria-label="later week">
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      <div key={weekStart} style={{ animation: 'var(--animate-page-turn)' }}>
        {/* ── The take — the week that was ──────────────────────────────────────────── */}
        <section className="panel mb-5 p-4" aria-label="scorecard">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <span className="kicker">The take — the week that was</span>
            <span className="mono text-[11px] text-ink-soft">
              {card.hitRate === null
                ? 'nothing to score this week'
                : `${card.hits} of ${card.scored} routines met their target · ${card.totalSessions} sessions${card.totalMinutes ? ` · ${fmtMinutes(card.totalMinutes)} actual` : ''}`}
            </span>
          </div>
          {card.weeks.map((w) => {
            const r = s.routines[w.routineId];
            if (!r) return null;
            const band = bandFor(r, s.entries, s.exceptions, s.experiments, today, s.settings.weekStartsOn);
            const unitLabel = r.measure === 'duration' ? 'min' : r.unit || r.measure;
            return (
              <div key={w.routineId} className="chan flex items-center gap-3 py-2">
                <Pad state={w.exempt ? 'exception' : w.hit ? 'full' : 'missed'} accent={r.accent} size={22} />
                <div className="min-w-0 flex-1">
                  <button className="disp text-[14px] hover:underline" onClick={() => openRoutine(r.id)}>
                    {r.name}
                  </button>
                  <div className="mono text-[10.5px] text-ink-soft">
                    {w.exempt
                      ? 'exempt — every day was excused or paused'
                      : r.measure === 'check'
                        ? `${w.actual}/${w.effectiveTarget} days · ${w.sessions} sessions`
                        : `${w.actual}/${w.effectiveTarget} ${unitLabel} · ${w.sessions} sessions`}
                  </div>
                </div>
                <Lamp band={band.band} />
                <label className="flex items-center gap-1.5 text-[11px] text-ink-soft">
                  <input
                    type="checkbox"
                    checked={confirmed.includes(w.routineId) || (reviewed?.confirmed.includes(w.routineId) ?? false)}
                    onChange={(e) =>
                      setConfirmed((c) => (e.target.checked ? [...c, w.routineId] : c.filter((x) => x !== w.routineId)))
                    }
                    disabled={!!reviewed}
                  />
                  confirmed
                </label>
              </div>
            );
          })}
          {card.weeks.length === 0 && (
            <p className="py-3 text-[12.5px] text-ink-faint">No routines patched in yet for this week.</p>
          )}
        </section>

        {/* ── Reflection + one adjustment ─────────────────────────── */}
        {reviewed ? (
          <section className="panel mb-5 p-4" aria-label="filed review">
            <div className="kicker mb-2">Cut {fmtDay(reviewed.createdAt.slice(0, 10))}</div>
            <p className="mb-2 text-[13.5px] italic text-ink-soft">"{reviewed.reflection}"</p>
            {reviewed.adjustment && (
              <p className="text-[13px]">
                <span className="kicker mr-2">One adjustment</span>
                {reviewed.adjustment}
              </p>
            )}
          </section>
        ) : filed ? (
          <section className="panel mb-5 p-4" aria-label="filed review">
            <p className="disp text-[15px] text-indigo">Cut. The machine turns the measure.</p>
          </section>
        ) : (
          <section className="panel mb-5 p-4" aria-label="reflect">
            <div className="kicker mb-2">One honest minute</div>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!reflection.trim()) return;
                s.saveReview({ weekStart, confirmed, reflection, adjustment });
                setFiled(true);
              }}
            >
              <Field label={prompt}>
                <textarea
                  className="f-textarea"
                  value={reflection}
                  onChange={(e) => setReflection(e.target.value)}
                  placeholder="two or three lines, no essays"
                />
              </Field>
              <Field label="One adjustment for next week (optional)" hint="a single change, not a resolution">
                <input
                  className="f-input"
                  value={adjustment}
                  onChange={(e) => setAdjustment(e.target.value)}
                  placeholder="e.g. move Review to before dinner"
                />
              </Field>
              <div className="flex justify-end">
                <button type="submit" className="btn btn--primary" disabled={!reflection.trim()}>
                  Cut the take
                </button>
              </div>
            </form>
          </section>
        )}
      </div>

      {/* ── Past reviews ─────────────────────────────────────────── */}
      {weeksWithHistory.length > 0 && (
        <section aria-label="past reviews">
          <div className="kicker mb-2">Past takes</div>
          <div className="border-y border-rule">
            {weeksWithHistory.slice(0, 10).map((w) => (
              <button
                key={w}
                className={cx('chan flex w-full items-center justify-between px-2 py-2 text-left', w === weekStart && 'bg-black/5')}
                onClick={() => setWeekStart(w)}
              >
                <span className="mono text-[11.5px]">week of {fmtWeekRange(w)}</span>
                <span className="mono text-[10px] uppercase text-ink-faint">filed {fmtDay(s.reviews[w].createdAt.slice(0, 10))}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
