import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useFolio, selectActiveTerm, selectTermCourses, selectCourseCommitments } from '../store';
import { Field, FInput, FSelect } from '../components/Field';
import { Stamp } from '../components/Stamp';
import { courseColorVar, nextCourseColor, COURSE_COLORS } from '../lib/colors';
import {
  stampDate,
  fullDate,
  fmtMinutes,
  addDaysISO,
  diffDaysISO,
  todayISO,
  weekStartISO,
  isoAtTime,
  cn,
} from '../lib/utils';
import { remainingMinutes, atRisk } from '../lib/schedule';
import type { Course, CourseColor } from '../lib/types';
import { ImportSheet } from '../components/ImportSheet';
import { Archive, ArchiveRestore, FileDown, Plus, BookOpen } from 'lucide-react';

/**
 * Semester folio — the term's course ledger, workload-by-week density strip,
 * and per-course dossier cards. Add/archive courses and file new commitments
 * here.
 */
export function SemesterView({
  onOpenCourse,
  onInspect,
}: {
  onOpenCourse: (id: string) => void;
  onInspect: (id: string) => void;
}) {
  const s = useFolio();
  const term = useFolio(selectActiveTerm);
  const courses = useFolio(useShallow(selectTermCourses));
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const active = courses.filter((c) => !c.archived);
  const archived = courses.filter((c) => c.archived);

  // ── workload by week: due-commitment count + remaining minutes per week ──
  const weeks = useMemo(() => {
    if (!term) return [];
    const start = weekStartISO(term.startDate, s.settings.weekStartsOn);
    const out: { week: string; due: number; mins: number; past: boolean }[] = [];
    const open = Object.values(s.commitments).filter(
      (c) => c.status === 'open' && courses.some((co) => co.id === c.courseId),
    );
    for (let w = start; w <= term.endDate && out.length < 24; w = addDaysISO(w, 7)) {
      const wEnd = addDaysISO(w, 7);
      const inWeek = open.filter((c) => c.dueAt.slice(0, 10) >= w && c.dueAt.slice(0, 10) < wEnd);
      out.push({
        week: w,
        due: inWeek.length,
        mins: inWeek.reduce((sum, c) => sum + remainingMinutes(c), 0),
        past: wEnd < todayISO(),
      });
    }
    return out;
  }, [term, s.commitments, s.settings.weekStartsOn, courses]);

  const maxMins = Math.max(60, ...weeks.map((w) => w.mins));

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      {/* term masthead — the term's cover document */}
      <div className="text-center mb-2">
        <p className="kicker">REGISTRAR FOLIO · TERM DOCUMENTS</p>
        <h1 className="slab text-[30px] font-semibold leading-tight mt-1">{term?.name ?? 'No term filed'}</h1>
        {term && (
          <p className="mono text-[10.5px] text-[color:var(--color-ink-soft)] mt-1.5 tracking-[0.08em]">
            {fullDate(term.startDate)} — {fullDate(term.endDate)} · {diffDaysISO(term.startDate, term.endDate)} DAYS
          </p>
        )}
      </div>
      <div className="double-rule mb-5" />
      <div className="flex justify-end -mt-8 mb-5">
        <Stamp text={term ? 'ON FILE' : 'UNFILED'} tone={term ? 'ok' : 'ink'} />
      </div>

      {/* workload strip — deadline density across the term */}
      {weeks.length > 0 && (
        <section aria-label="Workload by week" className="mb-8">
          <div className="hrule kicker mb-3">DEADLINE DENSITY BY WEEK</div>
          <div className="flex items-end gap-[3px] h-20" role="img" aria-label="Bar chart of remaining effort per week">
            {weeks.map((w) => {
              const isCur = todayISO() >= w.week && todayISO() < addDaysISO(w.week, 7);
              return (
                <div key={w.week} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`Week of ${stampDate(w.week)} — ${w.due} due, ${fmtMinutes(w.mins)} remaining`}>
                  <div
                    className={cn(
                      'w-full rounded-t-[2px] transition-all',
                      w.past ? 'bg-[rgb(var(--ink-rgb)/0.12)]' : isCur ? 'bg-[rgb(var(--ink-rgb)/0.62)]' : 'bg-[rgb(var(--ink-rgb)/0.3)]',
                    )}
                    style={{ height: `${Math.max(3, (w.mins / maxMins) * 52)}px` }}
                  />
                  <span className={cn('mono text-[8.5px] truncate', isCur ? 'text-[color:var(--color-ink)] font-semibold' : 'text-[color:var(--color-ink-faint)]')}>
                    {stampDate(w.week).replace(' ', '/')}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* course ledger */}
      <section aria-label="Courses">
        <div className="flex items-center justify-between mb-3">
          <div className="hrule kicker flex-1 mr-4">COURSE LEDGER</div>
          <div className="flex gap-2">
            <button className="btn btn--ghost !py-1.5 !px-3 inline-flex items-center gap-1.5" onClick={() => setImporting(true)} title="Stage a Modular AI extraction for review">
              <FileDown size={13} /> Import
            </button>
            <button className="btn btn--ghost !py-1.5 !px-3 inline-flex items-center gap-1.5" onClick={() => setAdding((a) => !a)}>
              <Plus size={13} /> Course
            </button>
          </div>
        </div>

        {adding && <NewCourseForm onDone={() => setAdding(false)} />}
        {importing && <ImportSheet onClose={() => setImporting(false)} />}

        <div className="space-y-4">
          {active.map((c, i) => (
            <div key={c.id} className="animate-[deal_0.4s_cubic-bezier(0.22,0.9,0.3,1)_both]" style={{ animationDelay: `${i * 70}ms` }}>
              <CourseDossierCard course={c} onOpen={() => onOpenCourse(c.id)} onInspect={onInspect} />
            </div>
          ))}
        </div>

        {archived.length > 0 && (
          <div className="mt-6">
            <button
              className="mono text-[10.5px] tracking-[0.12em] text-[color:var(--color-ink-faint)] hover:text-[color:var(--color-ink-soft)] uppercase"
              onClick={() => setShowArchived((v) => !v)}
            >
              {showArchived ? '▾' : '▸'} Withdrawn courses ({archived.length})
            </button>
            {showArchived && (
              <div className="mt-2 space-y-2 opacity-70">
                {archived.map((c) => (
                  <div key={c.id} className="slip pl-6 pr-3 py-2.5 flex items-center gap-3">
                    <span className="absolute left-0 top-0 bottom-0 w-[6px]" style={{ background: courseColorVar(c.color) }} />
                    <div className="flex-1">
                      <span className="mono text-[11px] font-semibold">{c.code}</span>
                      <span className="slab text-[14px] ml-2 text-[color:var(--color-ink-soft)] line-through">{c.name}</span>
                    </div>
                    <button className="xbtn" onClick={() => s.archiveCourse(c.id, false)} title="Restore course" aria-label={`Restore ${c.code}`}>
                      <ArchiveRestore size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function NewCourseForm({ onDone }: { onDone: () => void }) {
  const s = useFolio();
  const courses = useFolio(useShallow(selectTermCourses));
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [instructor, setInstructor] = useState('');
  const [meeting, setMeeting] = useState('');
  const [target, setTarget] = useState('');
  const [color, setColor] = useState<CourseColor>(nextCourseColor(courses.map((c) => c.color)));
  const [template, setTemplate] = useState<'blank' | 'stem' | 'humanities'>('blank');
  const term = useFolio(selectActiveTerm);

  const file = () => {
    if (!code.trim() && !name.trim()) return;
    const course = s.addCourse({
      code: code.trim().toUpperCase() || name.trim().slice(0, 8).toUpperCase(),
      name: name.trim() || code.trim().toUpperCase(),
      instructor: instructor.trim() || undefined,
      meetingPattern: meeting.trim() || undefined,
      targetGrade: target.trim() || undefined,
      color,
    });
    if (template !== 'blank' && term) seedTemplate(s, course.id, template, term.startDate);
    onDone();
  };

  return (
    <form
      className="slip pl-6 pr-4 py-4 mb-4 animate-[slip-in_0.3s_cubic-bezier(0.22,0.9,0.3,1)_both]"
      onSubmit={(e) => { e.preventDefault(); file(); }}
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Course code">
          <FInput autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="MATH 211" className="mono" />
        </Field>
        <Field label="Tab color">
          <FSelect value={color} onChange={(e) => setColor(e.target.value as CourseColor)}>
            {COURSE_COLORS.map((c) => (
              <option key={c.key} value={c.key}>{c.name}</option>
            ))}
          </FSelect>
        </Field>
        <Field label="Course name" className="sm:col-span-2">
          <FInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Linear Algebra" />
        </Field>
        <Field label="Instructor">
          <FInput value={instructor} onChange={(e) => setInstructor(e.target.value)} placeholder="Prof. Rivera" />
        </Field>
        <Field label="Meeting pattern" hint="e.g. MWF 09:10 · Rm 214">
          <FInput value={meeting} onChange={(e) => setMeeting(e.target.value)} />
        </Field>
        <Field label="Target grade">
          <FInput value={target} onChange={(e) => setTarget(e.target.value)} placeholder="A" className="mono" />
        </Field>
        <Field label="Template" hint={template === 'blank' ? 'empty syllabus' : 'files starter commitments'} className="sm:col-span-2">
          <FSelect value={template} onChange={(e) => setTemplate(e.target.value as typeof template)}>
            <option value="blank">Blank syllabus</option>
            <option value="stem">STEM course — weekly reading + pset + lab, midterm, final</option>
            <option value="humanities">Humanities seminar — weekly reading + response, essay, final</option>
          </FSelect>
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn btn--ghost" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn">File course</button>
      </div>
    </form>
  );
}

function CourseDossierCard({
  course,
  onOpen,
  onInspect,
}: {
  course: Course;
  onOpen: () => void;
  onInspect: (id: string) => void;
}) {
  const s = useFolio();
  const commitments = useFolio(useShallow((st) => selectCourseCommitments(st, course.id)));
  const open = commitments.filter((c) => c.status === 'open');
  const done = commitments.filter((c) => c.status === 'done');
  const remain = open.reduce((sum, c) => sum + remainingMinutes(c), 0);
  const nextDue = open.filter((c) => remainingMinutes(c) > 0).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
  const lateCount = open.filter((c) => c.dueAt.slice(0, 10) < todayISO()).length;
  const risks = atRisk(open, todayISO(), s.commitments);

  return (
    <div className="slip pl-7 pr-4 py-4">
      <span className="absolute left-0 top-0 bottom-0 w-[7px]" style={{ background: courseColorVar(course.color) }} aria-hidden />
      {/* syllabus cover — the issued document's face */}
      <div className="text-center">
        <p className="kicker !text-[9px]">COURSE SYLLABUS</p>
        <button
          onClick={onOpen}
          className="slab text-[19px] font-semibold leading-tight hover:underline decoration-1 underline-offset-[3px] mt-0.5"
        >
          <span className="mono text-[12px] tracking-[0.06em] mr-2 text-[color:var(--color-ink-soft)]">{course.code}</span>
          {course.name}
        </button>
        <p className="mono text-[10px] text-[color:var(--color-ink-faint)] mt-0.5 tracking-[0.06em]">
          {[course.instructor, course.meetingPattern].filter(Boolean).join(' · ').toUpperCase() || 'NO MEETING PATTERN FILED'}
        </p>
      </div>
      <div className="double-rule mt-3" />
      <div className="flex items-center justify-between mt-2">
        <span className="mono text-[10px] text-[color:var(--color-ink-faint)]">{open.length} open · {done.length} filed</span>
        <div className="flex items-center gap-1">
          {course.targetGrade && (
            <span className="mono text-[10px] border border-[color:var(--color-rule-dark)] rounded-[3px] px-1.5 py-0.5 text-[color:var(--color-ink-soft)]" title="Target grade">
              → {course.targetGrade}
            </span>
          )}
          <button
            className="xbtn"
            onClick={() => s.archiveCourse(course.id, true)}
            title="Withdraw course"
            aria-label={`Withdraw ${course.code}`}
          >
            <Archive size={14} />
          </button>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-4 flex-wrap text-[12px]">
        <span className="mono text-[color:var(--color-ink-soft)]">{fmtMinutes(remain)} left</span>
        {lateCount > 0 && (
          <span className="mono text-[color:var(--color-late)] font-semibold">{lateCount} late</span>
        )}
        {risks.length > 0 && (
          <span className="mono text-[color:var(--color-ink-soft)]" title={risks.map((r) => `${r.commitment.title} — ${r.reason}`).join('\n')}>
            {risks.length} at risk
          </span>
        )}
        {nextDue && (
          <span className="mono text-[color:var(--color-ink-faint)]">
            next: {nextDue.title.slice(0, 28)}{nextDue.title.length > 28 ? '…' : ''} {stampDate(nextDue.dueAt.slice(0, 10))}
          </span>
        )}
      </div>

      {open.length > 0 && (
        <div className="mt-3 pt-3 border-t border-dashed border-[color:var(--color-rule)] space-y-1">
          {open.slice(0, 3).map((c) => (
            <button
              key={c.id}
              onClick={() => onInspect(c.id)}
              className="w-full flex items-center gap-2 text-left group"
            >
              <BookOpen size={11} className="text-[color:var(--color-ink-faint)] shrink-0" />
              <span className="slab text-[13.5px] group-hover:underline decoration-1 underline-offset-2 truncate">{c.title}</span>
              <span className={cn('mono text-[10px] ml-auto shrink-0', c.dueAt.slice(0, 10) < todayISO() ? 'text-[color:var(--color-late)] font-semibold' : 'text-[color:var(--color-ink-faint)]')}>
                {stampDate(c.dueAt.slice(0, 10))}
              </span>
            </button>
          ))}
          {open.length > 3 && (
            <button onClick={onOpen} className="mono text-[10.5px] text-[color:var(--color-ink-faint)] hover:text-[color:var(--color-ink)] uppercase tracking-[0.1em]">
              +{open.length - 3} more in dossier →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Course templates — a starter schedule filed with the course ────────────
const TEMPLATES = {
  stem: [
    { type: 'reading', title: 'Chapter reading', recurrence: 'weekly', weight: 5, minutes: 60, offset: 3 },
    { type: 'assignment', title: 'Problem set', recurrence: 'weekly', weight: 10, minutes: 90, offset: 5 },
    { type: 'lab', title: 'Lab writeup', recurrence: 'weekly', weight: 10, minutes: 90, offset: 6 },
    { type: 'exam', title: 'Midterm exam', weight: 25, minutes: 240, offset: 49 },
    { type: 'exam', title: 'Final exam', weight: 30, minutes: 300, offset: 98 },
  ],
  humanities: [
    { type: 'reading', title: 'Assigned reading', recurrence: 'weekly', weight: 5, minutes: 75, offset: 2 },
    { type: 'assignment', title: 'Response paper', recurrence: 'weekly', weight: 10, minutes: 90, offset: 4 },
    { type: 'project', title: 'Term essay', weight: 30, minutes: 360, offset: 70 },
    { type: 'exam', title: 'Final exam', weight: 25, minutes: 240, offset: 98 },
  ],
} as const;

type TemplateKind = keyof typeof TEMPLATES;

function seedTemplate(s: ReturnType<typeof useFolio.getState>, courseId: string, kind: TemplateKind, termStart: string) {
  for (const t of TEMPLATES[kind]) {
    s.addCommitment({
      courseId,
      type: t.type,
      title: t.title,
      dueAt: isoAtTime(addDaysISO(termStart, t.offset), '23:59'),
      weight: t.weight,
      estimatedMinutes: t.minutes,
      recurrence: 'recurrence' in t ? 'weekly' : undefined,
    });
  }
}
