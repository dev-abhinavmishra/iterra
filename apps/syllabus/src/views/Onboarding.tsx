import { useMemo, useRef, useState } from 'react';
import { useFolio } from '../store';
import { Field, FInput, FSelect } from '../components/Field';
import { Stamp } from '../components/Stamp';
import { addDaysISO, stampDate } from '../lib/utils';
import { nextCourseColor, COURSE_COLORS, courseColorVar } from '../lib/colors';
import type { CourseColor } from '../lib/types';
import { ArrowRight, Plus } from 'lucide-react';

interface DraftCourse {
  code: string;
  name: string;
  color: CourseColor;
}

/**
 * First-run intake — the registrar seats a new student: one term card and a
 * course ledger. Whole flow is keyboard-complete: Enter advances, the last
 * Enter files the folio.
 */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const createTerm = useFolio((s) => s.createTerm);
  const addCourse = useFolio((s) => s.addCourse);

  const year = new Date().getFullYear();
  const month = new Date().getMonth();
  const guessName = month >= 7 && month <= 11 ? `Fall ${year}` : month <= 4 ? `Spring ${year}` : `Summer ${year}`;
  const guessStart = month >= 7 ? `${year}-08-25` : month <= 4 ? `${year}-01-12` : `${year}-06-01`;

  const [termName, setTermName] = useState(guessName);
  const [startDate, setStartDate] = useState(guessStart);
  const [endDate, setEndDate] = useState(addDaysISO(guessStart, 105));
  const [rows, setRows] = useState<DraftCourse[]>([
    { code: '', name: '', color: 'oxblood' },
    { code: '', name: '', color: 'hunter' },
    { code: '', name: '', color: 'navy' },
  ]);
  const [step, setStep] = useState<'term' | 'courses'>('term');

  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);
  const nameRefs = useRef<(HTMLInputElement | null)[]>([]);

  const filled = useMemo(() => rows.filter((r) => r.code.trim() || r.name.trim()), [rows]);

  const goCourses = () => {
    setStep('courses');
    requestAnimationFrame(() => codeRefs.current[0]?.focus());
  };

  const setRow = (i: number, patch: Partial<DraftCourse>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const addRow = () => {
    const used = rows.map((r) => r.color);
    setRows((rs) => [...rs, { code: '', name: '', color: nextCourseColor(used) }]);
    requestAnimationFrame(() => codeRefs.current[rows.length]?.focus());
  };

  const file = () => {
    const term = createTerm({
      name: termName.trim() || 'Untitled term',
      startDate,
      endDate,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    for (const r of filled) {
      addCourse({
        termId: term.id,
        code: r.code.trim() || r.name.trim().slice(0, 8).toUpperCase() || 'COURSE',
        name: r.name.trim() || r.code.trim() || 'Untitled',
        color: r.color,
      });
    }
    onDone();
  };

  return (
    <div className="min-h-full flex items-center justify-center p-4 bg-[color:var(--color-desk)]">
      <div className="sheet w-full max-w-2xl p-6 sm:p-9 animate-[sheet-in_0.34s_cubic-bezier(0.2,0.8,0.3,1)_both]">
        {/* intake header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="kicker mb-1.5">OFFICE OF THE REGISTRAR — PLANNING DESK</div>
            <h1 className="slab text-3xl font-semibold leading-tight">Syllabus</h1>
            <p className="mt-1.5 text-[13.5px] text-[color:var(--color-ink-soft)] max-w-md">
              File your term once. The folio turns course requirements into a realistic
              daily plan — and hands each block to Timer when it’s time to work.
            </p>
          </div>
          <Stamp text="INTAKE" tone="ok" className="mt-2 shrink-0" />
        </div>

        {step === 'term' && (
          <section aria-label="Term registration">
            <div className="hrule kicker mb-5">TERM CARD</div>
            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="Term name" className="sm:col-span-1">
                <FInput
                  autoFocus
                  value={termName}
                  onChange={(e) => setTermName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && goCourses()}
                  placeholder={guessName}
                />
              </Field>
              <Field label="First day">
                <FInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </Field>
              <Field label="Last day">
                <FInput type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </Field>
            </div>
            <div className="mt-6 flex items-center justify-between">
              <span className="mono text-[11px] text-[color:var(--color-ink-faint)]">
                {stampDate(startDate)} → {stampDate(endDate)}
              </span>
              <button className="btn inline-flex items-center gap-2" onClick={goCourses}>
                Course ledger <ArrowRight size={13} />
              </button>
            </div>
          </section>
        )}

        {step === 'courses' && (
          <section
            aria-label="Course ledger"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && filled.length > 0) file();
            }}
          >
            <div className="hrule kicker mb-5">COURSE LEDGER — {termName.toUpperCase()}</div>
            <p className="text-[12.5px] text-[color:var(--color-ink-soft)] mb-4">
              One row per course. Enter moves down the ledger; the color is the course’s
              spine tab.
            </p>
            <div className="space-y-2.5">
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[30px_110px_1fr_110px] gap-2.5 items-center">
                  <span
                    className="h-[26px] w-[14px] rounded-[2px] justify-self-center"
                    style={{ background: courseColorVar(r.color) }}
                    aria-hidden
                  />
                  <FInput
                    ref={(el) => { codeRefs.current[i] = el; }}
                    value={r.code}
                    onChange={(e) => setRow(i, { code: e.target.value.toUpperCase() })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') nameRefs.current[i]?.focus();
                    }}
                    placeholder={`CODE ${i + 1}`}
                    aria-label={`Course ${i + 1} code`}
                    className="f-input mono text-[12px]"
                  />
                  <FInput
                    ref={(el) => { nameRefs.current[i] = el; }}
                    value={r.name}
                    onChange={(e) => setRow(i, { name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (i === rows.length - 1) addRow();
                        else codeRefs.current[i + 1]?.focus();
                      }
                    }}
                    placeholder="Course name"
                    aria-label={`Course ${i + 1} name`}
                  />
                  <FSelect
                    value={r.color}
                    onChange={(e) => setRow(i, { color: e.target.value as CourseColor })}
                    aria-label={`Course ${i + 1} tab color`}
                    className="mono text-[11px]"
                  >
                    {COURSE_COLORS.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.name}
                      </option>
                    ))}
                  </FSelect>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button className="btn btn--ghost inline-flex items-center gap-1.5" onClick={addRow}>
                <Plus size={13} /> Add row
              </button>
              <button className="btn" onClick={file} disabled={filled.length === 0} title="⌘/Ctrl+Enter also files">
                File {filled.length > 0 ? `${filled.length} course${filled.length === 1 ? '' : 's'}` : 'folio'}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
