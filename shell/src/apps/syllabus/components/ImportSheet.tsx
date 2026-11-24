import { useEffect, useMemo, useRef, useState } from 'react';
import { useFolio } from '../store';
import { Field, FInput, FSelect } from './Field';
import { parseImportPayload, type ImportPayload, type ImportRow } from '../lib/import';
import { dueDateISO, fmtTime12, isoAtTime, localTimeHHMM } from '../lib/utils';
import { importIdentity, MAX_SCHEDULE_LENGTH, parseSchedulePaste } from '../lib/schedulePaste';
import { nextCourseColor } from '../lib/colors';
import { placeActive } from '../../active';
import { PlacePortal } from '../../portal';
import type { CommitmentType } from '../lib/types';
import { FileDown, X } from 'lucide-react';

const TYPES: CommitmentType[] = ['assignment', 'exam', 'quiz', 'reading', 'project', 'lab', 'custom'];

/**
 * Import sheet — the spec-mandated confirmation table. A Modular AI payload
 * (deep-link ?import=… or pasted JSON) is staged here; nothing is filed until
 * the registrar confirms. Each row can be edited or struck before filing.
 */
export function ImportSheet({ initial, courseId, onClose }: {
  initial?: ImportPayload;
  courseId?: string;
  onClose: () => void;
}) {
  const s = useFolio();
  const termId = (courseId && s.courses[courseId]?.termId) || s.activeTermId;
  const term = termId ? s.terms[termId] : undefined;
  const courses = useMemo(
    () => Object.values(s.courses).filter(c => !c.archived && (c.id === courseId || c.termId === s.activeTermId)),
    [s.courses, s.activeTermId, courseId],
  );
  const targetFor = (draft?: ImportPayload) => {
    const norm = (value?: string) => value?.toLowerCase().replace(/\s+/g, '');
    const matching = courses.filter(c =>
      (draft?.code && norm(c.code) === norm(draft.code)) ||
      (draft?.courseName && (norm(c.name) === norm(draft.courseName) || norm(c.code) === norm(draft.courseName))),
    );
    return courses.find(c => c.id === courseId)?.id ?? (matching.length === 1 ? matching[0].id : 'new');
  };
  const [payload, setPayload] = useState<ImportPayload | null>(initial ?? null);
  const [paste, setPaste] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [target, setTarget] = useState(() => targetFor(initial));
  const [newCode, setNewCode] = useState(initial?.code ?? '');
  const [newName, setNewName] = useState(initial?.courseName ?? '');
  const [filed, setFiled] = useState<number | null>(null);
  const [skipped, setSkipped] = useState<ReturnType<typeof parseSchedulePaste>['skipped']>([]);
  const ref = useRef<HTMLDivElement>(null);
  const headline = useRef<HTMLHeadingElement>(null);
  const pasteField = useRef<HTMLTextAreaElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const phase = filed !== null ? 'done' : payload ? 'review' : 'paste';

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    return () => prev?.focus?.();
  }, []);
  useEffect(() => {
    (phase === 'paste' ? pasteField.current : headline.current)?.focus();
  }, [phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!placeActive('syllabus')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        close.current();
      }
      if (e.key !== 'Tab') return;
      const controls = Array.from(ref.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea, select, summary',
      ) ?? []).filter(el => el.getClientRects().length > 0);
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!ref.current?.contains(document.activeElement) || document.activeElement === (e.shiftKey ? first : last)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const stage = () => {
    if (paste.length > MAX_SCHEDULE_LENGTH) {
      setErr('Paste a smaller section of the schedule to review it.');
      return;
    }
    const data = parseImportPayload(paste);
    const plain = data.ok || ['{', '['].includes(paste.trimStart()[0]) ? null : parseSchedulePaste(paste, term);
    const draft = data.payload ?? plain?.payload;
    setSkipped(plain?.skipped ?? []);
    if (!draft?.rows.length) {
      setErr(plain
        ? 'No dated assignments found. Put one assignment on each line and include a date such as 2027-03-04.'
        : data.error ?? 'Could not read that import.');
      return;
    }
    setErr(data.dropped ? `${data.dropped} rows need a title and a date.` : null);
    setTarget(targetFor(draft));
    setNewCode(draft.code ?? '');
    setNewName(draft.courseName ?? '');
    setPayload(draft);
  };

  const patchRow = (i: number, patch: Partial<ImportRow>) =>
    setPayload((p) => (p ? { ...p, rows: p.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) } : p));

  const existing = useMemo(() => new Set(Object.values(s.commitments)
    .filter(c => c.courseId === target).map(importIdentity)), [s.commitments, target]);
  const seen = new Set<string>();
  const rows = (payload?.rows ?? []).map(row => {
    const key = importIdentity(row);
    const duplicate = existing.has(key) || seen.has(key);
    if (row.accepted && row.title.trim()) seen.add(key);
    return { row, duplicate };
  });
  const checked = rows.filter(({ row, duplicate }) => row.accepted && !duplicate && row.title.trim()).map(({ row }) => row);

  const file = () => {
    if (!payload || !checked.length) return;
    const store = useFolio.getState();
    let selectedId = target;
    if (target !== 'new' && (!store.courses[target] || store.courses[target].archived)) {
      setErr('This course is no longer available. Choose another course.');
      return;
    }
    if (target === 'new') {
      if (!store.activeTermId || !store.terms[store.activeTermId]) {
        setErr('Start a term in Planning before adding a new course.');
        return;
      }
      const code = newCode.trim().toUpperCase();
      if (!code || !newName.trim()) {
        setErr('Enter a name and code for the new course.');
        return;
      }
      const duplicateCourse = Object.values(store.courses).find(c => !c.archived &&
        c.termId === store.activeTermId && c.code.replace(/\s+/g, '').toUpperCase() === code.replace(/\s+/g, ''));
      if (duplicateCourse) {
        setTarget(duplicateCourse.id);
        setErr('That course already exists. Review the assignments before adding them.');
        return;
      }
      const c = store.addCourse({
        name: newName.trim(),
        code,
        instructor: payload.instructor,
        meetingPattern: payload.meetingPattern,
        color: nextCourseColor(courses.map(course => course.color)),
      });
      selectedId = c.id;
    }
    const latestKeys = new Set(Object.values(useFolio.getState().commitments)
      .filter(c => c.courseId === selectedId).map(importIdentity));
    const toFile = checked.filter(r => !latestKeys.has(importIdentity(r)));
    if (!toFile.length) {
      setErr('These assignments are already in the course.');
      return;
    }
    store.addCommitments(toFile.map(row => ({
      courseId: selectedId,
      type: row.type,
      title: row.title.trim(),
      detail: row.detail,
      dueAt: row.dueAt,
      weight: row.weight,
      estimatedMinutes: row.estimatedMinutes,
      recurrence: row.recur ? 'weekly' : undefined,
    })));
    setFiled(toFile.length);
  };

  /* portaled to the place root — SemesterView renders this inside `.sheet`
     (position: relative) and the scrollable <main>, where an inline overlay
     would cover only the folio page and drift with the scroll offset */
  return (
    <PlacePortal place="syllabus">
    <div className="absolute inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 p-0 sm:p-6" role="dialog" aria-modal="true" aria-label="Import course schedule">
      <div
        ref={ref}
        tabIndex={-1}
        className="w-full max-w-3xl max-h-full overflow-y-auto bg-[color:var(--color-paper)] border border-[color:var(--color-rule)] shadow-2xl outline-none"
      >
        <header className="flex items-baseline gap-3 px-5 pt-4 pb-3 border-b border-[color:var(--color-rule)]">
          <FileDown size={15} className="translate-y-0.5 text-[color:var(--color-ink-soft)]" />
          <h2 ref={headline} tabIndex={-1} className="font-slab text-lg outline-none">
            {phase === 'review' ? 'Review assignments' : phase === 'done' ? 'Schedule added' : 'Import a course schedule'}
          </h2>
          <button className="xbtn ml-auto" onClick={onClose} aria-label="Close import">
            <X size={14} />
          </button>
        </header>

        {filed !== null ? (
          <div className="px-5 py-10 text-center">
            <p role="status" className="font-slab text-xl">{filed} assignment{filed === 1 ? '' : 's'} added.</p>
            <p className="text-[12px] text-[color:var(--color-ink-soft)] mt-2">
              Today uses these deadlines to suggest what to work on next.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button className="btn" onClick={() => {
                onClose();
                if (window.iterra?.open) window.iterra.open('#/today');
                else window.location.hash = '/today';
              }}>See Today’s plan</button>
              <button className="btn btn--ghost" onClick={onClose}>Keep planning</button>
            </div>
          </div>
        ) : !payload ? (
          <div className="px-5 py-5 space-y-4">
            <p className="text-[12.5px] text-[color:var(--color-ink-soft)] leading-relaxed">
              Paste one assignment per line with its due date. You’ll review the list before it’s saved.
            </p>
            <textarea
              className="w-full h-40 mono text-[11px] p-3 bg-[color:var(--color-card)] border border-[color:var(--color-rule)] focus:outline-none focus:border-[color:var(--color-ink-soft)]"
              ref={pasteField}
              placeholder={'2027-03-04 — Midterm\nEssay draft due March 11, 2027 at 5 pm'}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              aria-label="Paste course schedule"
            />
            {err && <p role="alert" className="text-sm text-[color:var(--color-late)]">{err}</p>}
            <div className="flex gap-2">
              <button className="btn" onClick={stage} disabled={!paste.trim()}>Preview assignments</button>
              <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Course">
                <FSelect aria-label="Course" value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="new">
                    Create a new course
                  </option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                  ))}
                </FSelect>
              </Field>
              <span className="text-xs text-[color:var(--color-ink-soft)] pb-2 ml-auto" aria-live="polite">
                {checked.length} of {payload.rows.length} ready to add
              </span>
            </div>
            {target === 'new' && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr]">
                <Field label="Course name"><FInput value={newName} onChange={e => setNewName(e.target.value)} maxLength={160} /></Field>
                <Field label="Course code"><FInput value={newCode} onChange={e => setNewCode(e.target.value)} maxLength={32} /></Field>
              </div>
            )}
            {err && <p role="alert" className="text-sm text-[color:var(--color-late)]">{err}</p>}
            {skipped.length > 0 && (
              <details className="rounded border border-[color:var(--color-rule)] px-3 py-2 text-sm">
                <summary className="cursor-pointer">{skipped.length} {skipped.length === 1 ? 'line needs' : 'lines need'} a clear date and title</summary>
                <ul className="mt-2 max-h-32 list-disc overflow-y-auto pl-5 text-xs">
                  {skipped.map(line => <li key={line.line} className="break-words">Line {line.line} · {line.text}</li>)}
                </ul>
              </details>
            )}

            <ul className="divide-y divide-[color:var(--color-rule)] rounded border border-[color:var(--color-rule)]">
              {rows.map(({ row, duplicate }, i) => {
                const fields = (
                  <div className="space-y-2">
                    <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-end gap-2 sm:grid-cols-[auto_minmax(0,1fr)_7rem_9rem]">
                      <input className="mb-2.5" type="checkbox" checked={row.accepted && !duplicate} disabled={duplicate}
                        onChange={e => patchRow(i, { accepted: e.target.checked })} aria-label={`Include ${row.title}`} />
                      <Field label="Title" className="col-span-2 min-w-0 sm:col-span-1">
                        <FInput value={row.title} onChange={e => patchRow(i, { title: e.target.value })} />
                      </Field>
                      <Field label="Type" className="col-start-2 min-w-0 sm:col-start-auto">
                        <FSelect aria-label={`Type for ${row.title}`} value={row.type} onChange={e => patchRow(i, { type: e.target.value as CommitmentType })}>
                          {TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                        </FSelect>
                      </Field>
                      <Field label="Due date" className="min-w-0">
                        <FInput type="date" value={dueDateISO(row.dueAt)}
                          onChange={e => e.target.value && patchRow(i, { dueAt: isoAtTime(e.target.value, localTimeHHMM(row.dueAt)) })} />
                      </Field>
                    </div>
                    <details className="text-xs text-[color:var(--color-ink-soft)]">
                      <summary className="cursor-pointer">
                        {fmtTime12(localTimeHHMM(row.dueAt))} · {row.estimatedMinutes} min estimated
                        {row.weight > 0 && ` · ${row.weight}% of grade`}
                      </summary>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <Field label="Due time" className="min-w-0">
                          <FInput type="time" value={localTimeHHMM(row.dueAt)}
                            onChange={e => e.target.value && patchRow(i, { dueAt: isoAtTime(dueDateISO(row.dueAt), e.target.value) })} />
                        </Field>
                        <Field label="Estimated minutes">
                          <FInput type="number" min={0} max={3600} value={row.estimatedMinutes}
                            onChange={e => patchRow(i, { estimatedMinutes: Math.min(3600, Math.max(0, Number(e.target.value) || 0)) })} />
                        </Field>
                        <Field label="Grade weight (%)">
                          <FInput type="number" min={0} max={100} value={row.weight}
                            onChange={e => patchRow(i, { weight: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} />
                        </Field>
                      </div>
                    </details>
                  </div>
                );
                return (
                  <li key={i} className="p-3">
                    {duplicate ? (
                      <details className="text-sm">
                        <summary className="cursor-pointer break-words">
                          {row.title}
                          <span className="ml-2 text-xs text-[color:var(--color-ink-soft)]">Already included for this date.</span>
                        </summary>
                        <div className="mt-2">{fields}</div>
                      </details>
                    ) : fields}
                  </li>
                );
              })}
            </ul>

            <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-[color:var(--color-rule)] bg-[color:var(--color-paper)] py-3">
              <button className="btn" onClick={file} disabled={!checked.length}>
                Add {checked.length} assignment{checked.length === 1 ? '' : 's'}
              </button>
              <button className="btn btn--ghost" onClick={() => setPayload(null)}>Back to paste</button>
              <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
    </PlacePortal>
  );
}
