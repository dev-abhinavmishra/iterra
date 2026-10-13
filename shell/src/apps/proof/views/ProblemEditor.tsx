import { useEffect, useState } from 'react';
import { useWorkbench } from '../store';
import type { AnswerSpec, Attachment, Difficulty, Problem } from '../lib/types';
import { uid } from '../lib/utils';
import { Field } from '../components/Field';
import { DocView } from '../components/DocView';
import { X, Plus, Trash2, ImagePlus } from 'lucide-react';
import { placeActive } from '../../active';

const SPEC_KINDS: { kind: AnswerSpec['kind']; label: string; hint: string }[] = [
  { kind: 'exact', label: 'Exact text', hint: 'normalized match — case, punctuation, spacing ignored' },
  { kind: 'numeric', label: 'Numeric ± tolerance', hint: 'value with optional unit, e.g. 9.8 m/s^2' },
  { kind: 'expression', label: 'Expression', hint: 'symbolic equivalence checked at sampled points' },
  { kind: 'choice', label: 'Multiple choice', hint: 'one or more correct options' },
  { kind: 'steps', label: 'Ordered steps', hint: 'milestones the learner self-checks' },
  { kind: 'rubric', label: 'Rubric', hint: 'criteria self-graded against levels' },
  { kind: 'open', label: 'Open response', hint: 'self-assessed in compare' },
];

export function ProblemEditor({ problem, onClose }: { problem: Problem | null; onClose: () => void }) {
  const addProblem = useWorkbench((s) => s.addProblem);
  const updateProblem = useWorkbench((s) => s.updateProblem);
  const courses = useWorkbench((s) => s.courses);
  const rubrics = useWorkbench((s) => s.rubrics);

  const [promptDoc, setPromptDoc] = useState(problem?.promptDoc ?? '');
  const [workedSolutionDoc, setWorkedSolutionDoc] = useState(problem?.workedSolutionDoc ?? '');
  const [topic, setTopic] = useState(problem?.topic ?? '');
  const [courseId, setCourseId] = useState(problem?.courseId ?? '');
  const [difficulty, setDifficulty] = useState<Difficulty>(problem?.difficulty ?? 3);
  const [tags, setTags] = useState((problem?.tags ?? []).join(', '));
  const [source, setSource] = useState(problem?.source ?? '');
  const [hints, setHints] = useState<string[]>(problem?.hints?.length ? [...problem.hints] : ['', '', '']);
  const [spec, setSpec] = useState<AnswerSpec>(problem?.answerSpec ?? { kind: 'open' });
  const [attachments, setAttachments] = useState<Attachment[]>(problem?.attachments ?? []);
  const [previewTab, setPreviewTab] = useState<'write' | 'preview'>('write');

  /* dialogs close on Escape — the backdrop click already did, the key
     was the missing half of the contract */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!placeActive("proof")) return;
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = () => {
    const record = {
      courseId: courseId || undefined,
      topic: topic.trim() || 'general',
      promptDoc,
      answerSpec: spec,
      workedSolutionDoc,
      hints: hints.map((h) => h.trim()),
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      difficulty,
      source: source.trim() || undefined,
      attachments,
    };
    if (problem) updateProblem(problem.id, record);
    else {
      const p = addProblem(record);
      /* new authored content → stir; course resolves off the real courseId */
      const course = p.courseId ? courses[p.courseId]?.code : undefined;
      (window as any).iterra?.feed?.({
        text: `problem set down: ${p.topic}`,
        url: `/apps/proof/?problem=${encodeURIComponent(p.id)}`,
        course,
      });
    }
    onClose();
  };

  const attach = (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      if (f.size > 600_000) continue;
      const r = new FileReader();
      r.onload = () => {
        setAttachments((a) => [...a, { id: uid('f_'), name: f.name, mime: f.type, dataUrl: String(r.result) }]);
      };
      r.readAsDataURL(f);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-[rgb(22_24_27/0.45)]" role="dialog" aria-modal="true" aria-label={problem ? 'Edit problem' : 'New problem'} onClick={onClose}>
      <div className="film h-full w-full max-w-2xl overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div className="kicker">{problem ? 'Edit problem' : 'New problem'}</div>
          <button className="xbtn" onClick={onClose} aria-label="Close editor"><X size={16} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Topic">
            <input className="f-input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="kinematics, integration by parts…" />
          </Field>
          <Field label="Course">
            <select className="f-select" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">— none —</option>
              {Object.values(courses).filter((c) => !c.archived).map((c) => (
                <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Difficulty">
            <select className="f-select" value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value) as Difficulty)}>
              {[1, 2, 3, 4, 5].map((d) => (
                <option key={d} value={d}>{d} — {['', 'routine', 'standard', 'tricky', 'hard', 'brutal'][d]}</option>
              ))}
            </select>
          </Field>
          <Field label="Tags (comma separated)">
            <input className="f-input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="quiz-4, tricky" />
          </Field>
          <Field label="Source">
            <input className="f-input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="textbook ch.4, worksheet, gradestack…" />
          </Field>
        </div>

        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="f-label !mb-0">Prompt — Markdown + $LaTeX$</span>
            <button className="xbtn mono text-[10px]" onClick={() => setPreviewTab(previewTab === 'write' ? 'preview' : 'write')}>
              {previewTab === 'write' ? 'preview' : 'write'}
            </button>
          </div>
          {previewTab === 'write' ? (
            <textarea
              className="f-textarea font-mono text-[12.5px]"
              rows={6}
              value={promptDoc}
              onChange={(e) => setPromptDoc(e.target.value)}
              placeholder={'A ball is thrown at $v_0 = 12$ m/s…\n\nInline math $x^2$, display math $$…$$, **bold**, lists, images.'}
            />
          ) : (
            <div className="rounded border border-[var(--color-rule-dark)] bg-[var(--color-form)] p-3">
              <DocView doc={promptDoc} />
            </div>
          )}
        </div>

        <div className="mt-3">
          <span className="f-label">Attachments</span>
          <div className="flex flex-wrap items-center gap-2">
            {attachments.map((a) => (
              <div key={a.id} className="relative">
                <img src={a.dataUrl} alt={a.name} className="h-20 rounded border border-[var(--color-rule-dark)]" />
                <button
                  className="xbtn absolute -right-1 -top-1 !h-5 !w-5 bg-[var(--color-film)]"
                  onClick={() => setAttachments((arr) => arr.filter((x) => x.id !== a.id))}
                  aria-label={`Remove ${a.name}`}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
            <label className="xbtn !h-9 !w-9 border border-dashed border-[var(--color-rule-dark)]" title="Attach image (≤600KB)">
              <ImagePlus size={15} />
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => attach(e.target.files)} />
            </label>
          </div>
        </div>

        <div className="mt-4">
          <span className="f-label">Hint ladder — each level reveals only on demand</span>
          {['1 · concept cue', '2 · setup cue', '3 · next-step cue'].map((lbl, i) => (
            <div key={i} className="mt-1.5 flex items-center gap-2">
              <span className="mono w-24 shrink-0 text-[10px] text-[var(--color-hint-deep)]">{lbl}</span>
              <input
                className="f-input"
                value={hints[i] ?? ''}
                onChange={(e) => setHints((h) => h.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={i === 0 ? 'name the concept, not the method' : i === 1 ? 'how to set it up' : 'the next concrete step'}
              />
            </div>
          ))}
          <div className="mt-1 text-[11px] text-[var(--color-ink-faint)]">Level 4 is always the worked solution below.</div>
        </div>

        <div className="mt-4">
          <span className="f-label">Worked solution — shown only after submission</span>
          <textarea
            className="f-textarea font-mono text-[12.5px]"
            rows={5}
            value={workedSolutionDoc}
            onChange={(e) => setWorkedSolutionDoc(e.target.value)}
            placeholder="Full worked solution, Markdown + $LaTeX$…"
          />
        </div>

        <AnswerSpecEditor spec={spec} onChange={setSpec} rubrics={Object.values(rubrics)} />

        <div className="sticky bottom-0 mt-5 flex items-center justify-end gap-2 border-t border-[var(--color-rule)] bg-[var(--color-film)] py-3">
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--blueprint" onClick={save} disabled={!promptDoc.trim()}>
            {problem ? 'Save changes' : 'File problem'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AnswerSpecEditor({
  spec,
  onChange,
  rubrics,
}: {
  spec: AnswerSpec;
  onChange: (s: AnswerSpec) => void;
  rubrics: { id: string; title: string; criteria: { id: string; text: string }[]; levels: string[] }[];
}) {
  const kind = spec.kind;
  return (
    <div className="mt-4 rounded border border-[var(--color-rule-dark)] p-3">
      <span className="f-label">Answer check — layered, deterministic first</span>
      <div className="flex flex-wrap gap-1.5">
        {SPEC_KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            className={`chip cursor-pointer ${kind === k.kind ? 'chip--blue !border-[var(--color-blueprint)]' : ''}`}
            title={k.hint}
            onClick={() => onChange(defaultSpec(k.kind, spec))}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="mt-3">
        {kind === 'exact' && (
          <div className="flex items-end gap-3">
            <Field label="Expected answer">
              <input
                className="f-input"
                value={spec.kind === 'exact' ? spec.expected : ''}
                onChange={(e) => onChange({ kind: 'exact', expected: e.target.value })}
              />
            </Field>
            <label className="mb-2 flex items-center gap-1.5 text-[12px]">
              <input
                type="checkbox"
                checked={spec.kind === 'exact' && !!spec.caseSensitive}
                onChange={(e) => onChange({ kind: 'exact', expected: spec.kind === 'exact' ? spec.expected : '', caseSensitive: e.target.checked })}
              />
              case sensitive
            </label>
          </div>
        )}
        {kind === 'numeric' && (
          <div className="grid grid-cols-4 gap-2">
            <Field label="Value">
              <input
                className="f-input" type="number" step="any"
                value={spec.kind === 'numeric' ? spec.value : ''}
                onChange={(e) => onChange({ ...(spec.kind === 'numeric' ? spec : { kind: 'numeric', value: 0 }), value: Number(e.target.value) })}
              />
            </Field>
            <Field label="± tolerance" hint="absolute; blank = 0.1% of value">
              <input
                className="f-input" type="number" step="any"
                value={spec.kind === 'numeric' && spec.tolerance != null ? spec.tolerance : ''}
                onChange={(e) => onChange({ ...(spec.kind === 'numeric' ? spec : { kind: 'numeric', value: 0 }), tolerance: e.target.value === '' ? undefined : Number(e.target.value) })}
              />
            </Field>
            <Field label="± rel. tol" hint="fraction, e.g. 0.02">
              <input
                className="f-input" type="number" step="any"
                value={spec.kind === 'numeric' && spec.relTolerance != null ? spec.relTolerance : ''}
                onChange={(e) => onChange({ ...(spec.kind === 'numeric' ? spec : { kind: 'numeric', value: 0 }), relTolerance: e.target.value === '' ? undefined : Number(e.target.value) })}
              />
            </Field>
            <Field label="Unit" hint="e.g. m/s^2, kg·m/s">
              <input
                className="f-input"
                value={spec.kind === 'numeric' && spec.unit ? spec.unit : ''}
                onChange={(e) => onChange({ ...(spec.kind === 'numeric' ? spec : { kind: 'numeric', value: 0 }), unit: e.target.value || undefined })}
              />
            </Field>
          </div>
        )}
        {kind === 'expression' && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Expected expression" hint="e.g. x^2 + 2x + 1 — checked at sampled points">
              <input
                className="f-input"
                value={spec.kind === 'expression' ? spec.expected : ''}
                onChange={(e) => onChange({ kind: 'expression', expected: e.target.value, vars: spec.kind === 'expression' ? spec.vars : undefined })}
              />
            </Field>
            <Field label="Variables (comma, optional)">
              <input
                className="f-input"
                value={spec.kind === 'expression' && spec.vars ? spec.vars.join(', ') : ''}
                onChange={(e) => onChange({ kind: 'expression', expected: spec.kind === 'expression' ? spec.expected : '', vars: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })}
              />
            </Field>
          </div>
        )}
        {kind === 'choice' && <ChoiceEditor spec={spec} onChange={onChange} />}
        {kind === 'steps' && <StepsEditor spec={spec} onChange={onChange} />}
        {kind === 'rubric' && (
          <Field label="Rubric" hint="author rubrics in Settings → rubrics">
            <select
              className="f-select"
              value={spec.kind === 'rubric' ? spec.rubricId : ''}
              onChange={(e) => onChange({ kind: 'rubric', rubricId: e.target.value })}
            >
              <option value="">— choose —</option>
              {rubrics.map((r) => (
                <option key={r.id} value={r.id}>{r.title} ({r.criteria.length} criteria)</option>
              ))}
            </select>
          </Field>
        )}
        {kind === 'open' && (
          <div className="text-[12px] text-[var(--color-ink-soft)]">
            No machine check — the learner compares their work against the worked solution and self-grades. Fully usable offline.
          </div>
        )}
      </div>
    </div>
  );
}

function defaultSpec(kind: AnswerSpec['kind'], prev: AnswerSpec): AnswerSpec {
  switch (kind) {
    case 'exact': return { kind, expected: prev.kind === 'exact' ? prev.expected : '' };
    case 'numeric': return { kind, value: prev.kind === 'numeric' ? prev.value : 0, tolerance: 0.01 };
    case 'expression': return { kind, expected: prev.kind === 'expression' ? prev.expected : '' };
    case 'choice': return { kind, options: prev.kind === 'choice' ? prev.options : ['', ''], correct: prev.kind === 'choice' ? prev.correct : [0] };
    case 'steps': return { kind, steps: prev.kind === 'steps' ? prev.steps : [''] };
    case 'rubric': return { kind, rubricId: prev.kind === 'rubric' ? prev.rubricId : '' };
    case 'open': return { kind };
  }
}

function ChoiceEditor({ spec, onChange }: { spec: AnswerSpec; onChange: (s: AnswerSpec) => void }) {
  if (spec.kind !== 'choice') return null;
  const setOpt = (i: number, v: string) =>
    onChange({ ...spec, options: spec.options.map((o, j) => (j === i ? v : o)) });
  const toggle = (i: number) =>
    onChange({
      ...spec,
      correct: spec.correct.includes(i) ? spec.correct.filter((c) => c !== i) : [...spec.correct, i].sort((a, b) => a - b),
    });
  return (
    <div>
      {spec.options.map((o, i) => (
        <div key={i} className="mt-1.5 flex items-center gap-2">
          <input
            type="checkbox"
            checked={spec.correct.includes(i)}
            onChange={() => toggle(i)}
            aria-label={`option ${i + 1} correct`}
            title="mark correct"
          />
          <input className="f-input" value={o} onChange={(e) => setOpt(i, e.target.value)} placeholder={`option ${i + 1}`} />
          <button
            className="xbtn"
            aria-label={`remove option ${i + 1}`}
            onClick={() => onChange({ ...spec, options: spec.options.filter((_, j) => j !== i), correct: spec.correct.filter((c) => c !== i).map((c) => (c > i ? c - 1 : c)) })}
            disabled={spec.options.length <= 2}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button className="xbtn mono mt-2 text-[11px]" onClick={() => onChange({ ...spec, options: [...spec.options, ''] })}>
        <Plus size={12} className="mr-1" /> add option
      </button>
    </div>
  );
}

function StepsEditor({ spec, onChange }: { spec: AnswerSpec; onChange: (s: AnswerSpec) => void }) {
  if (spec.kind !== 'steps') return null;
  return (
    <div>
      {spec.steps.map((st, i) => (
        <div key={i} className="mt-1.5 flex items-center gap-2">
          <span className="rail-node !h-[24px] !w-[24px] !text-[9px]">{i + 1}</span>
          <input
            className="f-input"
            value={st}
            onChange={(e) => onChange({ ...spec, steps: spec.steps.map((x, j) => (j === i ? e.target.value : x)) })}
            placeholder={`milestone ${i + 1} — e.g. "isolated x on one side"`}
          />
          <button
            className="xbtn"
            aria-label={`remove step ${i + 1}`}
            onClick={() => onChange({ ...spec, steps: spec.steps.filter((_, j) => j !== i) })}
            disabled={spec.steps.length <= 1}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button className="xbtn mono mt-2 text-[11px]" onClick={() => onChange({ ...spec, steps: [...spec.steps, ''] })}>
        <Plus size={12} className="mr-1" /> add milestone
      </button>
    </div>
  );
}
