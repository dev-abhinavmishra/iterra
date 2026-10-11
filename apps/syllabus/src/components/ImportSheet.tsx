import { useEffect, useMemo, useRef, useState } from 'react';
import { useFolio } from '../store';
import { Field, FInput, FSelect } from './Field';
import { parseImportPayload, type ImportPayload, type ImportRow } from '../lib/import';
import { cn, fmtMinutes } from '../lib/utils';
import type { CommitmentType } from '../lib/types';
import { FileDown, X } from 'lucide-react';

const TYPES: CommitmentType[] = ['assignment', 'exam', 'quiz', 'reading', 'project', 'lab', 'custom'];

/**
 * Import sheet — the spec-mandated confirmation table. A Modular AI payload
 * (deep-link ?import=… or pasted JSON) is staged here; nothing is filed until
 * the registrar confirms. Each row can be edited or struck before filing.
 */
export function ImportSheet({ initial, onClose }: { initial?: ImportPayload; onClose: () => void }) {
  const s = useFolio();
  const courses = useMemo(
    () => Object.values(s.courses).filter((c) => c.termId === s.activeTermId && !c.archived),
    [s.courses, s.activeTermId],
  );
  const [payload, setPayload] = useState<ImportPayload | null>(initial ?? null);
  const [paste, setPaste] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [target, setTarget] = useState<string>('new');
  const [filed, setFiled] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // prefer an existing course matching the payload's code/name
  useEffect(() => {
    if (!payload) return;
    const hit = courses.find(
      (c) =>
        (payload.code && c.code.toLowerCase() === payload.code.toLowerCase()) ||
        (payload.courseName && c.name.toLowerCase() === payload.courseName.toLowerCase()),
    );
    setTarget(hit ? hit.id : 'new');
  }, [payload, courses]);

  const stage = () => {
    const res = parseImportPayload(paste);
    if (!res.ok || !res.payload) {
      setErr(res.error ?? 'Could not read that payload.');
      return;
    }
    setErr(res.dropped ? `${res.dropped} row${res.dropped === 1 ? '' : 's'} skipped — missing title or due date.` : null);
    setPayload(res.payload);
  };

  const patchRow = (i: number, patch: Partial<ImportRow>) =>
    setPayload((p) => (p ? { ...p, rows: p.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) } : p));

  const checked = payload?.rows.filter((r) => r.accepted) ?? [];

  const file = () => {
    if (!payload || !checked.length) return;
    let courseId = target;
    if (target === 'new') {
      // derive a code from "HIST 140"-style course strings when none is sent —
      // 'course' is the field Modular AI actually emits.
      const derived = payload.code
        ?? (payload.courseName && /[a-zA-Z]{2,}\s?\d/.test(payload.courseName) && payload.courseName.length <= 14
          ? payload.courseName.toUpperCase()
          : undefined)
        ?? 'IMPORT';
      const c = s.addCourse({
        name: payload.courseName || payload.code || 'Imported course',
        code: derived,
        instructor: payload.instructor,
        meetingPattern: payload.meetingPattern,
        color: 'slate',
      });
      courseId = c.id;
    }
    for (const r of checked) {
      s.addCommitment({
        courseId,
        type: r.type,
        title: r.title,
        detail: r.detail,
        dueAt: r.dueAt,
        weight: r.weight,
        estimatedMinutes: r.estimatedMinutes,
        pinned: false,
        dependencies: [],
        recurrence: r.recur ? 'weekly' : undefined,
      });
    }
    setFiled(checked.length);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 p-0 sm:p-6" role="dialog" aria-modal="true" aria-label="Import commitments">
      <div
        ref={ref}
        tabIndex={-1}
        className="w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-[color:var(--color-paper)] border border-[color:var(--color-rule)] shadow-2xl outline-none"
      >
        <header className="flex items-baseline gap-3 px-5 pt-4 pb-3 border-b border-[color:var(--color-rule)]">
          <FileDown size={15} className="translate-y-0.5 text-[color:var(--color-ink-soft)]" />
          <h2 className="font-slab text-lg">Incoming filing — confirmation required</h2>
          <span className="mono text-[10px] text-[color:var(--color-ink-faint)] ml-auto">
            {payload?.source ? `via ${payload.source}` : 'staging only — nothing filed yet'}
          </span>
          <button className="xbtn" onClick={onClose} aria-label="Close import">
            <X size={14} />
          </button>
        </header>

        {filed !== null ? (
          <div className="px-5 py-10 text-center">
            <p className="font-slab text-xl">{filed} commitment{filed === 1 ? '' : 's'} filed.</p>
            <p className="text-[12px] text-[color:var(--color-ink-soft)] mt-2">
              They’re on the registrar’s desk — the Today queue will surface them at the next planning pass.
            </p>
            <button className="btn mt-5" onClick={onClose}>Return to the desk</button>
          </div>
        ) : !payload ? (
          <div className="px-5 py-5 space-y-4">
            <p className="text-[12.5px] text-[color:var(--color-ink-soft)] leading-relaxed">
              Paste a Modular AI extraction (JSON). Every row lands in a review table first —
              <em> nothing is filed until you confirm it</em>.
            </p>
            <textarea
              className="w-full h-40 mono text-[11px] p-3 bg-[color:var(--color-card)] border border-[color:var(--color-rule)] focus:outline-none focus:border-[color:var(--color-ink-soft)]"
              placeholder='{"source":"modular","course":"HIST 140","commitments":[{"type":"exam","title":"Midterm","dueAt":"2027-03-04","weight":30,"estimatedMinutes":360}]}'
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              aria-label="Paste Modular AI import JSON"
            />
            {err && <p className="mono text-[11px] text-[color:var(--color-late)]">{err}</p>}
            <div className="flex gap-2">
              <button className="btn" onClick={stage} disabled={!paste.trim()}>Stage for review</button>
              <button className="xbtn" onClick={onClose}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="File under" hint={target === 'new' ? 'a new course is created on filing' : 'existing course'}>
                <FSelect value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="new">
                    New course — {payload.courseName || payload.code || 'Imported course'}
                  </option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                  ))}
                </FSelect>
              </Field>
              {err && <span className="mono text-[10.5px] text-[color:var(--color-late)] pb-2">{err}</span>}
              <span className="mono text-[10.5px] text-[color:var(--color-ink-faint)] pb-2 ml-auto">
                {checked.length} of {payload.rows.length} rows checked
              </span>
            </div>

            <table className="w-full text-left border border-[color:var(--color-rule)]">
              <thead>
                <tr className="mono text-[9.5px] uppercase tracking-wider text-[color:var(--color-ink-faint)] border-b border-[color:var(--color-rule)]">
                  <th className="px-2 py-1.5 w-8" aria-label="file this row"></th>
                  <th className="px-2 py-1.5">type</th>
                  <th className="px-2 py-1.5">title</th>
                  <th className="px-2 py-1.5 w-28">due</th>
                  <th className="px-2 py-1.5 w-16">wt%</th>
                  <th className="px-2 py-1.5 w-20">est.</th>
                </tr>
              </thead>
              <tbody>
                {payload.rows.map((r, i) => (
                  <tr
                    key={i}
                    className={cn('border-b border-[color:var(--color-rule)] last:border-0', !r.accepted && 'opacity-40')}
                  >
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={r.accepted}
                        onChange={(e) => patchRow(i, { accepted: e.target.checked })}
                        aria-label={`File ${r.title}`}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <FSelect value={r.type} onChange={(e) => patchRow(i, { type: e.target.value as CommitmentType })} aria-label="Type">
                        {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </FSelect>
                    </td>
                    <td className="px-2 py-1.5">
                      <FInput value={r.title} onChange={(e) => patchRow(i, { title: e.target.value })} aria-label="Title" />
                    </td>
                    <td className="px-2 py-1.5">
                      <FInput
                        type="date"
                        value={r.dueAt.slice(0, 10)}
                        onChange={(e) => e.target.value && patchRow(i, { dueAt: `${e.target.value}T17:00` })}
                        aria-label="Due date"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <FInput
                        type="number" min={0} max={100} value={r.weight}
                        onChange={(e) => patchRow(i, { weight: Number(e.target.value) || 0 })}
                        aria-label="Weight"
                      />
                    </td>
                    <td className="px-2 py-1.5 mono text-[10.5px] text-[color:var(--color-ink-soft)]">
                      {fmtMinutes(r.estimatedMinutes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center gap-2 pb-1">
              <button className="btn" onClick={file} disabled={!checked.length}>
                File {checked.length} commitment{checked.length === 1 ? '' : 's'}
              </button>
              <button className="xbtn" onClick={() => setPayload(null)}>Back to paste</button>
              <button className="xbtn" onClick={onClose}>Discard all</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
