import { useEffect, useMemo, useRef, useState } from 'react';
import { useFolio } from '../store';
import { Field, FInput, FSelect, FTextarea } from '../components/Field';
import { Stamp } from '../components/Stamp';
import { LinkForm } from '../views/CourseView';
import { selectLinksFor } from '../store';
import { useShallow } from 'zustand/react/shallow';
import { remainingMinutes, reversePlan } from '../lib/schedule';
import { appBadge } from '../lib/links';
import { courseColorVar } from '../lib/colors';
import { fmtMinutes, stampDate, todayISO, isoAtTime, cn } from '../lib/utils';
import type { Commitment, CommitmentType } from '../lib/types';
import { CheckCircle2, ExternalLink, Pin, RotateCcw, X } from 'lucide-react';

/**
 * Commitment inspector — the sheet that plans one outcome: deadline, weight,
 * effort, subtasks (as blocks), dependencies, and stapled resources.
 */
export function CommitmentDrawer({ commitment, onClose }: { commitment: Commitment; onClose: () => void }) {
  const s = useFolio();
  const course = s.courses[commitment.courseId];
  const links = useFolio(useShallow((st) => selectLinksFor(st, commitment.id)));
  const blocks = useMemo(
    () =>
      Object.values(s.blocks)
        .filter((b) => b.commitmentId === commitment.id)
        .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || a.plannedStart.localeCompare(b.plannedStart)),
    [s.blocks, commitment.id],
  );
  const [linking, setLinking] = useState(false);
  const [confirmReplan, setConfirmReplan] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const t = e.target as HTMLElement;
        if (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA' && t.tagName !== 'SELECT') onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const late = commitment.dueAt.slice(0, 10) < todayISO() && commitment.status === 'open';
  const remain = remainingMinutes(commitment);
  const deps = commitment.dependencies
    .map((id) => s.commitments[id])
    .filter(Boolean);

  const update = (patch: Partial<Commitment>) => s.updateCommitment(commitment.id, patch);

  const runReversePlan = () => {
    const proposals = reversePlan(commitment, {
      today: todayISO(),
      startTime: s.settings.studyWindowStart,
      maxBlock: s.settings.maxBlockMinutes,
    });
    if (proposals.length) s.acceptProposals(proposals);
    setConfirmReplan(false);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-[rgb(var(--desk-rgb)/0.6)]"
      role="dialog"
      aria-modal="true"
      aria-label={`Commitment: ${commitment.title}`}
      onClick={onClose}
    >
      <div
        ref={ref}
        tabIndex={-1}
        className="sheet w-full max-w-md h-full overflow-y-auto p-5 sm:p-6 outline-none rounded-none animate-[block-slide_0.35s_cubic-bezier(0.25,0.8,0.25,1)_both]"
        onClick={(e) => e.stopPropagation()}
        style={{ borderTop: `5px solid ${course ? courseColorVar(course.color) : 'var(--color-rule-dark)'}` }}
      >
        {/* header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="kicker">{course?.code ?? 'NO COURSE'}</span>
              {commitment.pinned && <Pin size={11} className="text-[color:var(--color-ink-soft)]" aria-label="Pinned" />}
            </div>
            <h2 className="slab text-[22px] font-semibold leading-tight">{commitment.title}</h2>
          </div>
          <button className="xbtn shrink-0" onClick={onClose} aria-label="Close inspector">
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <Stamp
            text={commitment.status === 'done' ? 'FILED' : late ? 'LATE' : 'OPEN'}
            tone={commitment.status === 'done' ? 'ok' : late ? 'late' : 'ink'}
          />
          <span className="mono text-[11px] text-[color:var(--color-ink-soft)]">
            {fmtMinutes(remain)} remain of {fmtMinutes(commitment.estimatedMinutes)}
          </span>
          <button
            className={cn('xbtn ml-auto', commitment.pinned && 'bg-[rgb(var(--ink-rgb)/0.1)]')}
            onClick={() => s.togglePin(commitment.id)}
            title={commitment.pinned ? 'Unpin' : 'Pin as urgent'}
            aria-pressed={commitment.pinned}
          >
            <Pin size={14} />
          </button>
        </div>

        {/* fields */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <FSelect
              value={commitment.type}
              onChange={(e) => update({ type: e.target.value as CommitmentType })}
            >
              {(['assignment', 'exam', 'quiz', 'reading', 'project', 'lab', 'custom'] as const).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </FSelect>
          </Field>
          <Field label="Due date">
            <FInput
              type="date"
              value={commitment.dueAt.slice(0, 10)}
              onChange={(e) => e.target.value && update({ dueAt: isoAtTime(e.target.value, '23:59') })}
            />
          </Field>
          <Field label="Weight">
            <FInput
              type="number"
              min={0}
              max={100}
              value={commitment.weight}
              onChange={(e) => update({ weight: Math.max(0, Number(e.target.value) || 0) })}
              className="mono"
            />
          </Field>
          <Field label="Repeats" hint="weekly until term end">
            <FSelect
              value={commitment.recurrence ?? ''}
              onChange={(e) => update({ recurrence: e.target.value === 'weekly' ? 'weekly' : undefined })}
            >
              <option value="">Does not repeat</option>
              <option value="weekly">Weekly</option>
            </FSelect>
          </Field>
          <Field label="Grade" hint="score of 100 — drives §1 scenarios">
            <FInput
              type="number"
              min={0}
              max={100}
              value={commitment.grade ?? ''}
              onChange={(e) => update({ grade: e.target.value === '' ? undefined : Math.min(100, Math.max(0, Number(e.target.value))) })}
              placeholder="—"
              className="mono"
            />
          </Field>
          <Field label="Estimated effort" hint={`${fmtMinutes(commitment.loggedMinutes)} logged`}>
            <FInput
              type="number"
              min={15}
              step={15}
              value={commitment.estimatedMinutes}
              onChange={(e) => update({ estimatedMinutes: Math.max(commitment.loggedMinutes + 15, Number(e.target.value) || 15) })}
              className="mono"
            />
          </Field>
          <Field label="Notes" className="col-span-2">
            <FTextarea
              value={commitment.detail ?? ''}
              onChange={(e) => update({ detail: e.target.value })}
              placeholder="Pages, rubric, room…"
              rows={2}
            />
          </Field>
          <Field label="Depends on" className="col-span-2" hint="holds this commitment until the dependency is filed done">
            <FSelect
              value=""
              onChange={(e) => {
                if (e.target.value) update({ dependencies: [...new Set([...commitment.dependencies, e.target.value])] });
              }}
            >
              <option value="">+ add dependency…</option>
              {Object.values(s.commitments)
                .filter((c) => c.id !== commitment.id && c.status === 'open' && !commitment.dependencies.includes(c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {s.courses[c.courseId]?.code} — {c.title}
                  </option>
                ))}
            </FSelect>
          </Field>
          {deps.length > 0 && (
            <ul className="col-span-2 space-y-1">
              {deps.map((d) => (
                <li key={d.id} className="flex items-center gap-2 text-[12.5px]">
                  <span className={cn('mono text-[9px] px-1 py-0.5 border rounded-[2px]', d.status === 'done' ? 'text-[color:var(--color-ok)] border-[color:var(--color-ok)]' : 'text-[color:var(--color-ink-faint)] border-[color:var(--color-rule-dark)]')}>
                    {d.status === 'done' ? 'DONE' : 'OPEN'}
                  </span>
                  <span className="slab text-[13px] truncate">{d.title}</span>
                  <button
                    className="xbtn ml-auto !w-5 !h-5"
                    onClick={() => update({ dependencies: commitment.dependencies.filter((x) => x !== d.id) })}
                    aria-label={`Remove dependency ${d.title}`}
                  >
                    <X size={11} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* plan steps */}
        <section className="mt-6" aria-label="Planned steps">
          <div className="flex items-center justify-between mb-2">
            <span className="kicker">PLAN STEPS</span>
            <button
              className="btn btn--ghost !py-1 !px-2.5 inline-flex items-center gap-1"
              onClick={() => setConfirmReplan(true)}
              title="Reverse-plan from the due date"
            >
              <RotateCcw size={11} /> Re-plan
            </button>
          </div>
          {confirmReplan && (
            <div className="slip pl-4 pr-3 py-2.5 mb-2 flex items-center gap-2 text-[12px]">
              <span className="flex-1">Cut fresh steps from the due date? Existing slips stay filed.</span>
              <button className="btn !py-1 !px-2.5" onClick={runReversePlan}>Yes</button>
              <button className="btn btn--ghost !py-1 !px-2.5" onClick={() => setConfirmReplan(false)}>No</button>
            </div>
          )}
          {blocks.length === 0 ? (
            <p className="text-[12px] text-[color:var(--color-ink-faint)]">
              No steps booked — re-plan cuts review → practice → check slips from the due date.
            </p>
          ) : (
            <ol className="space-y-1.5">
              {blocks.map((b) => (
                <li key={b.id} className="flex items-center gap-2.5 text-[12.5px]">
                  <span className="mono text-[10.5px] text-[color:var(--color-ink-faint)] w-24 shrink-0">
                    {stampDate(b.plannedDate)} {b.plannedStart}
                  </span>
                  <span className="slab text-[13.5px]">
                    {b.phase} · {fmtMinutes(b.plannedMinutes)}
                  </span>
                  {b.state === 'done' && <CheckCircle2 size={13} className="text-[color:var(--color-ok)]" />}
                  {b.actualMinutes != null && (
                    <span className="mono text-[9.5px] text-[color:var(--color-ink-faint)]">actual {fmtMinutes(b.actualMinutes)}</span>
                  )}
                  <button
                    className="xbtn ml-auto !w-5 !h-5"
                    onClick={() => s.deleteBlock(b.id)}
                    aria-label={`Remove ${b.phase} step on ${stampDate(b.plannedDate)}`}
                  >
                    <X size={11} />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* stapled resources */}
        <section className="mt-6" aria-label="Stapled resources">
          <div className="flex items-center justify-between mb-2">
            <span className="kicker">STAPLED RESOURCES</span>
            <button className="btn btn--ghost !py-1 !px-2.5" onClick={() => setLinking((v) => !v)}>
              + Staple
            </button>
          </div>
          {linking && <LinkForm commitmentId={commitment.id} onDone={() => setLinking(false)} />}
          {links.length === 0 && !linking ? (
            <p className="text-[12px] text-[color:var(--color-ink-faint)]">
              Staple an Ink note, Modular source, deck, or assessment.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {links.map((l) => (
                <li key={l.id} className="slip pl-4 pr-2.5 py-2 flex items-center gap-2">
                  <span className="mono text-[9px] font-semibold tracking-[0.1em] border border-[color:var(--color-rule-dark)] rounded-[2px] px-1 py-0.5 text-[color:var(--color-ink-soft)]">
                    {appBadge(l.app)}
                  </span>
                  <a href={l.deepLink} target="_blank" rel="noopener noreferrer" className="slab text-[13.5px] hover:underline truncate flex items-center gap-1">
                    {l.label} <ExternalLink size={11} className="shrink-0 text-[color:var(--color-ink-faint)]" />
                  </a>
                  <button className="xbtn ml-auto !w-5 !h-5" onClick={() => s.removeLink(l.id)} aria-label={`Remove ${l.label}`}>
                    <X size={11} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* footer actions */}
        <div className="mt-8 pt-4 border-t border-[color:var(--color-rule)] flex items-center gap-2">
          {commitment.status !== 'done' ? (
            <button className="btn flex-1" onClick={() => s.setCommitmentStatus(commitment.id, 'done')}>
              File as done
            </button>
          ) : (
            <button className="btn btn--ghost flex-1" onClick={() => s.setCommitmentStatus(commitment.id, 'open')}>
              Re-open
            </button>
          )}
          <button
            className="btn btn--ghost"
            onClick={() => {
              s.setCommitmentStatus(commitment.id, 'dropped');
              onClose();
            }}
          >
            Drop
          </button>
        </div>
      </div>
    </div>
  );
}
