import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useFolio, selectCourseCommitments, selectLinksFor, selectActiveTerm } from '../store';
import { Field, FInput, FSelect } from '../components/Field';
import { Stamp } from '../components/Stamp';
import { QuickAdd } from '../components/QuickAdd';
import { courseColorVar } from '../lib/colors';
import { estimateRatio, remainingMinutes, reversePlan, gradeScenario, atRisk } from '../lib/schedule';
import { resourceDeepLink, appBadge } from '../lib/links';
import {
  fmtMinutes,
  stampDate,
  todayISO,
  isoAtTime,
  cn,
} from '../lib/utils';
import type { CommitmentType, LinkedApp } from '../lib/types';
import { Archive, ExternalLink, Link2, Pin, Printer, X } from 'lucide-react';

/**
 * The living syllabus — the course's own document, kept current by the
 * registrar: masthead + double rule, § sections (evaluation, course schedule,
 * required materials, work ledger). Prints like the syllabus it is.
 */
export function CourseView({ courseId, onInspect }: { courseId: string; onInspect: (id: string) => void }) {
  const s = useFolio();
  const term = useFolio(selectActiveTerm);
  const course = s.courses[courseId];
  const commitments = useFolio(useShallow((st) => selectCourseCommitments(st, courseId)));
  const links = useFolio(useShallow((st) => selectLinksFor(st, undefined, courseId)));
  const [adding, setAdding] = useState(false);
  const [linking, setLinking] = useState(false);

  const blocks = useMemo(
    () => Object.values(s.blocks).filter((b) => commitments.some((c) => c.id === b.commitmentId)),
    [s.blocks, commitments],
  );

  const ratio = useMemo(
    () => estimateRatio(Object.values(s.blocks), courseId, s.commitments),
    [s.blocks, courseId, s.commitments],
  );

  const all = useFolio((st) => st.commitments);

  if (!course) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <p className="slab text-lg text-[color:var(--color-ink-soft)]">This document is missing — the course may have been withdrawn.</p>
      </div>
    );
  }

  const schedule = [...commitments].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const open = commitments.filter((c) => c.status === 'open');
  const done = commitments.filter((c) => c.status === 'done');
  const remainMin = open.reduce((sum, c) => sum + remainingMinutes(c), 0);
  const plannedMin = blocks.reduce((sum, b) => sum + b.plannedMinutes, 0);
  const actualMin = blocks.reduce((sum, b) => sum + (b.actualMinutes ?? 0), 0);
  const totalWeight = open.reduce((sum, c) => sum + c.weight, 0);
  const scenario = gradeScenario(commitments, course.targetGrade);
  const risks = atRisk(open, todayISO(), all);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-7">
      {/* the syllabus document itself — dealt onto the sheet */}
      <article
        className="syl-doc relative pl-7 pr-6 sm:pl-10 sm:pr-9 py-7 animate-[deal_0.4s_cubic-bezier(0.22,0.9,0.3,1)_both]"
        style={{ background: 'var(--color-slip)', border: '1px solid var(--color-rule)', boxShadow: 'var(--shadow-slip)' }}
        aria-label={`Syllabus for ${course.code}`}
      >
        <span className="absolute left-0 top-0 bottom-0 w-[7px]" style={{ background: courseColorVar(course.color) }} aria-hidden />

        {/* ── masthead ─────────────────────────────────────────── */}
        <header className="relative">
          <p className="kicker text-center">{term?.name ?? 'REGISTRAR FOLIO'}</p>
          <h1 className="slab text-[30px] sm:text-[34px] font-semibold text-center leading-tight mt-1">
            Course Syllabus
          </h1>
          <div className="double-rule mt-4" />
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 mono text-[11px]">
            <div className="flex justify-between gap-3">
              <dt className="text-[color:var(--color-ink-faint)]">COURSE</dt>
              <dd className="font-semibold text-right">{course.code}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[color:var(--color-ink-faint)]">TITLE</dt>
              <dd className="font-semibold text-right truncate">{course.name}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[color:var(--color-ink-faint)]">INSTRUCTOR</dt>
              <dd className="text-right truncate">{course.instructor ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[color:var(--color-ink-faint)]">MEETINGS</dt>
              <dd className="text-right truncate">{course.meetingPattern ?? '—'}</dd>
            </div>
          </dl>
          <div className="double-rule mt-3" />

          <div className="no-print absolute top-0 right-0 flex items-start gap-1.5">
            <button
              className="xbtn"
              onClick={() => window.print()}
              title="Print this syllabus"
              aria-label="Print this syllabus"
            >
              <Printer size={15} />
            </button>
            <button
              className="xbtn"
              onClick={() => s.archiveCourse(course.id, !course.archived)}
              title={course.archived ? 'Restore course' : 'Withdraw course'}
              aria-label={course.archived ? `Restore ${course.code}` : `Withdraw ${course.code}`}
            >
              <Archive size={15} />
            </button>
          </div>
          <Stamp
            text={course.archived ? 'WITHDRAWN' : 'ISSUED'}
            tone={course.archived ? 'ink' : 'ok'}
            className="absolute -top-1 right-0 no-print !mt-0 sm:right-14"
          />
        </header>

        {/* ── § 1 · Evaluation ─────────────────────────────────── */}
        <section className="mt-7" aria-label="Evaluation">
          <h2 className="syl-sec">
            <span className="syl-sec-no">§ 1.</span>
            <span className="kicker !text-[color:var(--color-ink)]">EVALUATION</span>
          </h2>
          <table className="syl-table mt-2">
            <tbody>
              <tr>
                <td className="slab text-[13.5px]">Target grade</td>
                <td className="mono text-[11.5px] text-right">{course.targetGrade ?? '—'}</td>
              </tr>
              <tr>
                <td className="slab text-[13.5px]">Grade weight outstanding</td>
                <td className="mono text-[11.5px] text-right">{totalWeight > 0 ? `${totalWeight} pts` : '—'}</td>
              </tr>
              <tr>
                <td className="slab text-[13.5px]">Estimated effort remaining</td>
                <td className="mono text-[11.5px] text-right">{fmtMinutes(remainMin)}</td>
              </tr>
              {risks.length > 0 && (
                <tr title={risks.map((r) => `${r.commitment.title} — ${r.reason}`).join('\n')}>
                  <td className="slab text-[13.5px]">At risk</td>
                  <td className="mono text-[11.5px] text-right">
                    {risks.length} item{risks.length === 1 ? '' : 's'}
                    <span className="text-[color:var(--color-ink-faint)]"> — {risks[0].reason}</span>
                  </td>
                </tr>
              )}
              <tr>
                <td className="slab text-[13.5px]">Booked on the desk</td>
                <td className="mono text-[11.5px] text-right">{fmtMinutes(plannedMin)}</td>
              </tr>
              <tr>
                <td className="slab text-[13.5px]">Actual effort logged</td>
                <td className="mono text-[11.5px] text-right">{fmtMinutes(actualMin)}</td>
              </tr>
              {scenario && (
                <tr>
                  <td className="slab text-[13.5px]">Current standing</td>
                  <td className="mono text-[11.5px] text-right">
                    {scenario.standing.toFixed(1)}% over {scenario.gradedWeight} graded pts
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {scenario?.needed != null && (
            <p className={cn(
              'mono text-[10.5px] mt-2',
              scenario.secured || !scenario.reachable
                ? 'text-[color:var(--color-ink-soft)]'
                : scenario.needed > scenario.standing + 5
                  ? 'text-[color:var(--color-late)]'
                  : 'text-[color:var(--color-ink-soft)]',
            )}>
              {scenario.secured
                ? `Registrar's scenario: the ${course.targetGrade} is secured — remaining work protects the margin.`
                : !scenario.reachable
                  ? `Registrar's scenario: ${course.targetGrade} is no longer reachable on the ${scenario.remainingWeight} pts outstanding — re-file the target or petition.`
                  : `Registrar's scenario: need ${scenario.needed.toFixed(0)}% average on the ${scenario.remainingWeight} pts outstanding to hold ${course.targetGrade}.`}
            </p>
          )}
          {scenario == null && course.targetGrade && (
            <p className="mono text-[10.5px] text-[color:var(--color-ink-faint)] mt-2">
              File grades on returned work to unlock the grade scenario.
            </p>
          )}
          {ratio != null && (
            <p className="mono text-[10.5px] text-[color:var(--color-ink-soft)] mt-2">
              Registrar's note: estimates run ×{ratio.toFixed(2)} of actual
              {ratio > 1.15 ? ' — plan bigger blocks.' : ratio < 0.85 ? ' — estimates are generous.' : ' — well calibrated.'}
            </p>
          )}
        </section>

        {/* ── § 2 · Course schedule ────────────────────────────── */}
        <section className="mt-8" aria-label="Course schedule">
          <div className="syl-sec">
            <span className="syl-sec-no">§ 2.</span>
            <span className="kicker !text-[color:var(--color-ink)]">COURSE SCHEDULE</span>
          </div>

          <div className="no-print mt-3 space-y-3">
            <QuickAdd courses={[course]} />
            <div className="flex justify-end">
              <button className="btn btn--ghost !py-1.5 !px-3" onClick={() => setAdding((a) => !a)}>
                {adding ? 'Close form' : '+ Commitment'}
              </button>
            </div>
            {adding && <NewCommitmentForm courseId={courseId} onDone={() => setAdding(false)} />}
          </div>

          {schedule.length === 0 ? (
            <p className="slab text-[14px] text-[color:var(--color-ink-faint)] mt-3 italic">
              No items on the schedule yet — file the first commitment above.
            </p>
          ) : (
            <table className="syl-table mt-2">
              <thead>
                <tr>
                  <th className="w-[68px]">Due</th>
                  <th>Item</th>
                  <th className="w-[72px]">Type</th>
                  <th className="w-[44px] text-right">Wt</th>
                  <th className="w-[92px] text-right">Effort</th>
                  <th className="w-[64px] text-right no-print">Status</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((c) => {
                  const late = c.status === 'open' && c.dueAt.slice(0, 10) < todayISO();
                  const filed = c.status === 'done';
                  return (
                    <tr
                      key={c.id}
                      className={cn('row-hit', late && 'late-row', filed && 'filed-row')}
                      onClick={() => onInspect(c.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onInspect(c.id); } }}
                      title={`Open ${c.title}`}
                    >
                      <td className="mono text-[11px] whitespace-nowrap">
                        {late ? <span className="font-semibold">LATE&nbsp;{stampDate(c.dueAt.slice(0, 10))}</span> : stampDate(c.dueAt.slice(0, 10))}
                      </td>
                      <td className="slab text-[14px] font-medium">
                        <span className={cn(filed && 'line-through')}>
                          {c.pinned && <Pin size={11} className="inline -mt-0.5 mr-1 text-[color:var(--color-ink-faint)]" aria-label="Pinned" />}
                          {c.title}
                        </span>
                      </td>
                      <td className="mono text-[10px] uppercase tracking-[0.08em]">{c.type}</td>
                      <td className="mono text-[11px] text-right">{c.weight > 0 ? c.weight : '—'}</td>
                      <td className="mono text-[10.5px] text-right whitespace-nowrap">
                        {filed
                          ? `${c.grade != null ? `${c.grade}% · ` : ''}${fmtMinutes(c.loggedMinutes)} log`
                          : `${fmtMinutes(remainingMinutes(c))} / ${fmtMinutes(c.estimatedMinutes)}`}
                      </td>
                      <td className="text-right no-print">
                        {filed
                          ? <Stamp text="DONE" tone="ok" className="!text-[7.5px] !border-[1.5px] !px-1 !py-0" />
                          : late
                            ? <span className="mono text-[9px] font-semibold text-[color:var(--color-late)]">LATE</span>
                            : <span className="mono text-[9px] text-[color:var(--color-ink-faint)]">OPEN</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        {/* ── § 3 · Required materials ─────────────────────────── */}
        <section className="mt-8" aria-label="Required materials">
          <div className="syl-sec">
            <span className="syl-sec-no">§ 3.</span>
            <span className="kicker !text-[color:var(--color-ink)]">REQUIRED MATERIALS</span>
            <span className="no-print ml-auto">
              <button className="btn btn--ghost !py-1 !px-2.5 inline-flex items-center gap-1" onClick={() => setLinking((v) => !v)}>
                <Link2 size={11} /> Staple
              </button>
            </span>
          </div>
          {linking && <div className="no-print"><LinkForm courseId={courseId} onDone={() => setLinking(false)} /></div>}
          {links.length === 0 && !linking ? (
            <p className="slab text-[13px] text-[color:var(--color-ink-faint)] mt-3 italic">
              No materials on file — staple Ink notes, Modular AI sources, Flashcards decks, or GradeStack assessments.
            </p>
          ) : (
            <table className="syl-table mt-2">
              <tbody>
                {links.map((l) => (
                  <tr key={l.id}>
                    <td className="w-[76px]">
                      <span className="mono text-[9px] font-semibold tracking-[0.1em] border border-[color:var(--color-rule-dark)] rounded-[2px] px-1 py-0.5 text-[color:var(--color-ink-soft)]">
                        {appBadge(l.app)}
                      </span>
                    </td>
                    <td>
                      <a
                        href={l.deepLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="slab text-[14px] hover:underline decoration-1 underline-offset-2 inline-flex items-center gap-1 min-w-0"
                      >
                        {l.label} <ExternalLink size={11} className="shrink-0 text-[color:var(--color-ink-faint)] no-print" />
                      </a>
                    </td>
                    <td className="w-[40px] text-right no-print">
                      <button className="xbtn" onClick={() => s.removeLink(l.id)} aria-label={`Remove ${l.label}`}>
                        <X size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* ── document footer ──────────────────────────────────── */}
        <footer className="doc-footer mt-9">
          <div className="double-rule" />
          <p className="mono text-[9.5px] text-[color:var(--color-ink-faint)] text-center mt-2 tracking-[0.1em]">
            {open.length} ITEM{open.length === 1 ? '' : 'S'} OUTSTANDING · {done.length} FILED · THIS DOCUMENT AMENDS ITSELF AS WORK IS STAMPED
          </p>
        </footer>
      </article>
    </div>
  );
}

export function NewCommitmentForm({ courseId, onDone }: { courseId: string; onDone: () => void }) {
  const s = useFolio();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<CommitmentType>('assignment');
  const [due, setDue] = useState(todayISO());
  const [weight, setWeight] = useState(10);
  const [minutes, setMinutes] = useState(60);
  const [plan, setPlan] = useState(true);

  const file = () => {
    if (!title.trim()) return;
    const c = s.addCommitment({
      courseId,
      type,
      title: title.trim(),
      dueAt: isoAtTime(due, '23:59'),
      weight,
      estimatedMinutes: Math.max(15, minutes),
    });
    if (plan) {
      const proposals = reversePlan(c, {
        today: todayISO(),
        startTime: s.settings.studyWindowStart,
        maxBlock: s.settings.maxBlockMinutes,
      });
      if (proposals.length) s.acceptProposals(proposals);
    }
    onDone();
  };

  return (
    <form
      className="slip pl-6 pr-4 py-4 mb-3 animate-[slip-in_0.3s_cubic-bezier(0.22,0.9,0.3,1)_both]"
      onSubmit={(e) => { e.preventDefault(); file(); }}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Title" className="col-span-2 sm:col-span-4">
          <FInput autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Problem set 4" />
        </Field>
        <Field label="Type">
          <FSelect value={type} onChange={(e) => setType(e.target.value as CommitmentType)}>
            {(['assignment', 'exam', 'quiz', 'reading', 'project', 'lab', 'custom'] as const).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </FSelect>
        </Field>
        <Field label="Due">
          <FInput type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Weight" hint="grade pts">
          <FInput type="number" min={0} max={100} value={weight} onChange={(e) => setWeight(Number(e.target.value) || 0)} className="mono" />
        </Field>
        <Field label="Est. effort" hint="minutes">
          <FInput type="number" min={15} step={15} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 15)} className="mono" />
        </Field>
      </div>
      <label className="mt-3 flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={plan} onChange={(e) => setPlan(e.target.checked)} className="accent-[#33302a]" />
        <span className="text-[12.5px] text-[color:var(--color-ink-soft)]">
          Reverse-plan into work blocks (review → practice → final check)
        </span>
      </label>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn btn--ghost" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn">File commitment</button>
      </div>
    </form>
  );
}

function LinkForm({ courseId, commitmentId, onDone }: { courseId?: string; commitmentId?: string; onDone: () => void }) {
  const s = useFolio();
  const [app, setApp] = useState<LinkedApp>('ink');
  const [label, setLabel] = useState('');
  const [resource, setResource] = useState('');

  const file = () => {
    if (!label.trim() || !resource.trim()) return;
    const deepLink = resource.startsWith('http') ? resource : resourceDeepLink(app, resource.trim(), s.settings);
    s.addLink({
      courseId,
      commitmentId,
      app,
      resourceType: 'note',
      resourceId: resource.trim(),
      label: label.trim(),
      deepLink,
    });
    onDone();
  };

  return (
    <form className="slip pl-6 pr-4 py-3.5 mb-3" onSubmit={(e) => { e.preventDefault(); file(); }}>
      <div className="grid grid-cols-[110px_1fr_1fr] gap-2.5 items-end">
        <Field label="App">
          <FSelect value={app} onChange={(e) => setApp(e.target.value as LinkedApp)}>
            <option value="ink">Ink</option>
            <option value="modular">Modular AI</option>
            <option value="flashcards">Flashcards</option>
            <option value="gradestack">GradeStack</option>
            <option value="other">Other</option>
          </FSelect>
        </Field>
        <Field label="Label">
          <FInput autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ch. 4 notes" />
        </Field>
        <Field label="Resource id or URL">
          <FInput value={resource} onChange={(e) => setResource(e.target.value)} placeholder="note_abc or https://…" className="mono text-[12px]" />
        </Field>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="btn btn--ghost !py-1.5" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn !py-1.5">Staple</button>
      </div>
    </form>
  );
}

export { LinkForm };
