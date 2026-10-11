import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useFolio, selectTermCourses } from '../store';
import { Stamp } from '../components/Stamp';
import { FTextarea } from '../components/Field';
import {
  weekStartISO,
  addDaysISO,
  stampDate,
  fmtMinutes,
  isoAtTime,
} from '../lib/utils';
import { estimateRatio } from '../lib/schedule';
import type { ISODate } from '../lib/types';
import { CheckCircle2, FileSignature } from 'lucide-react';

/**
 * Weekly review — reconciliation: what was planned vs. what logged, overdue
 * work resolved, next week's shape. Saved reviews stamp the week closed.
 */
export function ReviewView({ today }: { today: ISODate }) {
  const s = useFolio();
  const courses = useFolio(useShallow(selectTermCourses));
  const weekStart = weekStartISO(today, s.settings.weekStartsOn);
  const weekEnd = addDaysISO(weekStart, 7);
  const existing = s.reviews[weekStart];
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const weekBlocks = useMemo(
    () => Object.values(s.blocks).filter((b) => b.plannedDate >= weekStart && b.plannedDate < weekEnd),
    [s.blocks, weekStart, weekEnd],
  );

  const planned = weekBlocks.reduce((sum, b) => sum + b.plannedMinutes, 0);
  const actual = weekBlocks.reduce((sum, b) => sum + (b.actualMinutes ?? 0), 0);
  const done = weekBlocks.filter((b) => b.state === 'done');
  const slipped = weekBlocks.filter((b) => b.state !== 'done' && b.plannedDate < today);
  const ratio = estimateRatio(weekBlocks);

  const completedThisWeek = useMemo(
    () =>
      Object.values(s.commitments).filter(
        (c) => c.completedAt && c.completedAt.slice(0, 10) >= weekStart && c.completedAt.slice(0, 10) < weekEnd,
      ),
    [s.commitments, weekStart, weekEnd],
  );

  const overdue = useMemo(
    () =>
      Object.values(s.commitments).filter(
        (c) => c.status === 'open' && c.dueAt.slice(0, 10) < today && courses.some((co) => co.id === c.courseId),
      ),
    [s.commitments, today, courses],
  );

  const courseById = useMemo(() => Object.fromEntries(courses.map((c) => [c.id, c])), [courses]);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="kicker mb-1">WEEKLY REVIEW — RECONCILIATION</div>
          <h1 className="slab text-[28px] font-semibold leading-none">
            Week of {stampDate(weekStart)}
          </h1>
        </div>
        {existing && <Stamp text="CLOSED" tone="ok" className="mt-2" />}
      </div>

      {/* ledger: intent vs execution */}
      <section aria-label="Week ledger" className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-7">
        {[
          { k: 'Planned', v: fmtMinutes(planned) },
          { k: 'Logged', v: fmtMinutes(actual) },
          { k: 'Blocks done', v: `${done.length}/${weekBlocks.length}` },
          {
            k: 'Est. calibration',
            v: ratio != null ? `×${ratio.toFixed(2)}` : '—',
          },
        ].map((m) => (
          <div key={m.k} className="slip !shadow-none pl-4 pr-3 py-2.5">
            <div className="kicker !text-[9px]">{m.k}</div>
            <div className="mono text-[19px] font-semibold mt-0.5">{m.v}</div>
          </div>
        ))}
      </section>
      {ratio != null && (
        <p className="mono text-[11px] text-[color:var(--color-ink-soft)] -mt-5 mb-6 pl-1">
          Actual ran {ratio > 1 ? `${Math.round((ratio - 1) * 100)}% over` : `${Math.round((1 - ratio) * 100)}% under`} estimates — the registrar will size next week's slips accordingly.
        </p>
      )}

      {/* slipped work */}
      <section aria-label="Slipped blocks" className="mb-7">
        <div className="hrule kicker mb-3">SLIPPED — RESOLVE BEFORE CLOSING</div>
        {slipped.length === 0 ? (
          <p className="text-[12.5px] text-[color:var(--color-ok)] pl-1 flex items-center gap-1.5">
            <CheckCircle2 size={14} /> Nothing slipped. Clean week.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {slipped.map((b) => {
              const c = s.commitments[b.commitmentId];
              const course = c ? courseById[c.courseId] : undefined;
              return (
                <li key={b.id} className="slip pl-5 pr-3 py-2 flex items-center gap-3">
                  <span className="mono text-[10.5px] text-[color:var(--color-late)] font-semibold shrink-0">
                    {stampDate(b.plannedDate)}
                  </span>
                  <span className="slab text-[14px] truncate flex-1">
                    {course?.code} — {c?.title}
                  </span>
                  <button className="btn btn--ghost !py-1 !px-2.5" onClick={() => s.carryBlock(b.id, today)}>
                    Today
                  </button>
                  <button className="btn btn--ghost !py-1 !px-2.5" onClick={() => s.carryBlock(b.id, addDaysISO(weekEnd, 0))}>
                    Next wk
                  </button>
                  <button className="xbtn" onClick={() => s.deleteBlock(b.id)} title="Strike from the books (commitment stays open)" aria-label="Strike block">
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* overdue commitments */}
      <section aria-label="Overdue commitments" className="mb-7">
        <div className="hrule kicker mb-3">OVERDUE COMMITMENTS</div>
        {overdue.length === 0 ? (
          <p className="text-[12.5px] text-[color:var(--color-ink-faint)] pl-1">Nothing overdue on the register.</p>
        ) : (
          <ul className="space-y-1.5">
            {overdue.map((c) => (
              <li key={c.id} className="flex items-center gap-3 pl-1">
                <span className="mono text-[10.5px] text-[color:var(--color-late)] font-semibold">{stampDate(c.dueAt.slice(0, 10))}</span>
                <span className="slab text-[14px] flex-1 truncate">
                  {courseById[c.courseId]?.code} — {c.title}
                </span>
                <button className="btn btn--ghost !py-1 !px-2.5" onClick={() => s.setCommitmentStatus(c.id, 'done')}>
                  Mark filed
                </button>
                <button
                  className="btn btn--ghost !py-1 !px-2.5"
                  onClick={() => s.updateCommitment(c.id, { dueAt: isoAtTime(addDaysISO(today, 3), '23:59') })}
                >
                  +3d
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* filed this week */}
      {completedThisWeek.length > 0 && (
        <section aria-label="Completed this week" className="mb-7">
          <div className="hrule kicker mb-3">FILED THIS WEEK</div>
          <ul className="space-y-1">
            {completedThisWeek.map((c) => (
              <li key={c.id} className="flex items-center gap-2 pl-1">
                <Stamp text="DONE" tone="ok" className="!text-[8px]" />
                <span className="slab text-[13.5px] text-[color:var(--color-ink-soft)]">
                  {courseById[c.courseId]?.code} — {c.title}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* registrar's note + close */}
      <section aria-label="Review notes">
        <div className="hrule kicker mb-3">REGISTRAR'S NOTE</div>
        <FTextarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What actually happened this week? What changes next week?"
          rows={4}
        />
        <div className="mt-4 flex justify-end">
          <button
            className="btn inline-flex items-center gap-2"
            onClick={() => s.saveReview(weekStart, notes)}
          >
            <FileSignature size={13} /> {existing ? 'Update closure' : 'Close the week'}
          </button>
        </div>
      </section>
    </div>
  );
}
