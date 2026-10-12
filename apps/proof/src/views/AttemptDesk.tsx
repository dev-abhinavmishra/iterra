import { useEffect, useState } from 'react';
import { useWorkbench } from '../store';
import type { Attempt, WorkStep } from '../lib/types';
import { autoCheck, answerKind } from '../lib/checking';
import { timerDeepLink } from '../lib/links';
import { openDeep } from '../lib/iterra';
import { cn, fmtElapsed, uid } from '../lib/utils';
import { DocView } from '../components/DocView';
import { DrawPad } from '../components/DrawPad';
import { ProofRail, ConfidencePicker, HINT_LABELS } from '../components/ProofRail';
import { DiffMeter } from '../components/DiffMeter';
import { RetestChip, ToMarginButton } from '../components/TerrainChips';
import type { ViewKey } from '../components/TopTabs';
import {
  Lightbulb, Send, Timer, Plus, Trash2, ImagePlus, PenLine, CheckCheck,
} from 'lucide-react';

export function AttemptDesk({
  attemptId,
  onCompare,
  goView,
}: {
  attemptId: string;
  onCompare: (attemptId: string) => void;
  goView: (v: ViewKey) => void;
}) {
  const attempt = useWorkbench((s) => s.attempts[attemptId]);
  const problem = useWorkbench((s) => (attempt ? s.problems[attempt.problemId] : undefined));
  const rubric = useWorkbench((s) =>
    problem?.answerSpec.kind === 'rubric' ? s.rubrics[problem.answerSpec.rubricId] : undefined,
  );
  const course = useWorkbench((s) => (problem?.courseId ? s.courses[problem.courseId] : undefined));
  const session = useWorkbench((s) => (attempt?.sessionId ? s.sessions[attempt.sessionId] : undefined));
  const settings = useWorkbench((s) => s.settings);
  const updateAttempt = useWorkbench((s) => s.updateAttempt);
  const addStep = useWorkbench((s) => s.addStep);
  const updateStep = useWorkbench((s) => s.updateStep);
  const removeStep = useWorkbench((s) => s.removeStep);
  const revealHint = useWorkbench((s) => s.revealHint);
  const submitAttempt = useWorkbench((s) => s.submitAttempt);
  const setTimerUrl = useWorkbench((s) => s.setTimerUrl);

  const [elapsed, setElapsed] = useState(0);
  const [activeStep, setActiveStep] = useState(0);
  const [verdict, setVerdict] = useState<string | null>(null);
  const submitted = !!attempt?.submittedAt;

  // elapsed ticker
  useEffect(() => {
    if (!attempt || submitted) return;
    const t = setInterval(() => {
      setElapsed(Date.now() - new Date(attempt.startedAt).getTime());
    }, 1000);
    return () => clearInterval(t);
  }, [attempt, submitted]);

  // keyboard: h = hint, digits = confidence
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || e.metaKey || e.ctrlKey) return;
      if (e.key === 'h' && !submitted) {
        e.preventDefault();
        revealHint(attemptId);
      }
      if (/^[1-5]$/.test(e.key) && !submitted) {
        updateAttempt(attemptId, { confidence: Number(e.key) });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [attemptId, submitted, revealHint, updateAttempt]);


  const submit = () => {
    if (!attempt || !problem) return;
    const v = autoCheck(problem.answerSpec, attempt, rubric);
    if (v.mode !== 'ungraded' && v.result) {
      submitAttempt(attemptId, { result: v.result, resultSource: v.mode === 'auto' ? 'auto' : 'self' });
      setVerdict(v.detail);
      // straight into compare — the learning loop continues there
      onCompare(attemptId);
    } else {
      // can't machine-grade — go to compare for self-assessment
      submitAttempt(attemptId, { result: 'incorrect', resultSource: 'self' });
      // reset result: ungraded attempts shouldn't be stamped incorrect silently —
      // keep submittedAt, leave result for compare to set
      updateAttempt(attemptId, { result: undefined, resultSource: 'self' });
      onCompare(attemptId);
    }
  };

  const launchTimer = () => {
    if (!session || !problem) return;
    const url = timerDeepLink({
      settings,
      session,
      minutes: session.rules.minutes,
      label: `Proof — ${session.intent ?? problem.topic ?? 'practice'}`,
      course,
    });
    setTimerUrl(session.id, url);
    openDeep(url);
  };

  if (!attempt || !problem) {
    return (
      <div className="mx-auto max-w-4xl p-10 text-center text-[var(--color-paper)]">
        Attempt not found.
        <button className="btn btn--ghost ml-3" onClick={() => goView('library')}>Back to library</button>
      </div>
    );
  }

  const kind = answerKind(problem.answerSpec);
  const revealedHints = attempt.hintReveals.map((h) => h.level).filter((l) => l <= 3);
  const step = attempt.work[activeStep] ?? attempt.work[attempt.work.length - 1];

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16">
      <div className="pad mt-3 flex flex-col">
        {/* ── desk header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-rule)] px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="chip chip--blue">{problem.topic || 'general'}</span>
            {course && <span className="chip">{course.code}</span>}
            <DiffMeter level={problem.difficulty} />
            {session && <span className="chip chip--violet">session · {(session.problemIds.indexOf(problem.id) + 1) || '—'}/{session.problemIds.length}</span>}
            <RetestChip attemptId={attempt.id} />
          </div>
          <div className="flex items-center gap-3">
            <span className="mono text-[13px] tabular-nums text-[var(--color-ink-soft)]" aria-label="elapsed time">
              {submitted && attempt.submittedAt
                ? fmtElapsed(new Date(attempt.submittedAt).getTime() - new Date(attempt.startedAt).getTime())
                : fmtElapsed(elapsed)}
            </span>
            {session && !session.timerUrl && (
              <button className="btn btn--ghost !py-1.5" onClick={launchTimer} title="Start a linked Timer session">
                <span className="inline-flex items-center gap-1.5"><Timer size={12} /> Timer</span>
              </button>
            )}
            {session?.timerUrl && <span className="chip" title="linked Timer session">⏱ linked</span>}
            <ToMarginButton attempt={attempt} problem={problem} />
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* ── proof rail ── */}
          <div className="w-14 shrink-0 border-r border-[var(--color-rule)] pt-3">
            <ProofRail attempt={attempt} activeStep={activeStep} onStepClick={setActiveStep} />
          </div>

          {/* ── work surface ── */}
          <div className="min-w-0 flex-1">
            {/* prompt */}
            <div className="border-b border-[var(--color-rule)] px-6 py-4">
              <div className="kicker mb-2"><span className="turnstile">⊢</span> the claim — to prove</div>
              <DocView doc={problem.promptDoc} className="text-[15px]" />
              {problem.attachments.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {problem.attachments.map((a) => (
                    <img key={a.id} src={a.dataUrl} alt={a.name} className="max-h-40 rounded border border-[var(--color-rule)]" />
                  ))}
                </div>
              )}
            </div>

            {/* hints revealed so far */}
            {revealedHints.length > 0 && (
              <div className="space-y-2 border-b border-[var(--color-rule)] px-6 py-3">
                {revealedHints.map((lvl) => (
                  <div key={lvl} className="hint-pane px-3 py-2">
                    <div className="mono mb-1 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[var(--color-hint-deep)]">
                      hint {lvl} — {HINT_LABELS[lvl as 1 | 2 | 3]}
                    </div>
                    <DocView doc={problem.hints[lvl - 1] ?? ''} className="text-[13px]" />
                  </div>
                ))}
              </div>
            )}

            {/* step editor */}
            <div className="px-6 py-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="kicker">your proof — assertion {activeStep + 1} of {attempt.work.length}</div>
                <div className="flex items-center gap-1">
                  <button
                    className="xbtn mono text-[10px]"
                    onClick={() => {
                      const ws = addStep(attempt.id);
                      setActiveStep(attempt.work.length);
                      void ws;
                    }}
                    disabled={submitted}
                  >
                    <Plus size={12} className="mr-1" /> assertion
                  </button>
                  <button
                    className="xbtn"
                    onClick={() => {
                      removeStep(attempt.id, step.id);
                      setActiveStep(Math.max(0, activeStep - 1));
                    }}
                    disabled={submitted || attempt.work.length <= 1}
                    aria-label="Remove assertion"
                    title="Remove assertion"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <StepEditor
                step={step}
                readOnly={submitted}
                onChange={(patch) => updateStep(attempt.id, step.id, patch)}
              />
            </div>
          </div>

          {/* ── right column: answer + hints + submit ── */}
          <aside className="flex w-72 shrink-0 flex-col border-l border-[var(--color-rule)]">
            <div className="border-b border-[var(--color-rule)] px-4 py-3">
              <div className="kicker mb-2"><span className="turnstile">∴</span> conclusion</div>
              {kind === 'text' && (
                <input
                  className="f-input"
                  placeholder="exact answer"
                  value={attempt.answer ?? ''}
                  disabled={submitted}
                  onChange={(e) => updateAttempt(attempt.id, { answer: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                />
              )}
              {kind === 'numeric' && (
                <input
                  className="f-input"
                  placeholder="value + unit, e.g. 9.8 m/s^2"
                  value={attempt.answer ?? ''}
                  disabled={submitted}
                  onChange={(e) => updateAttempt(attempt.id, { answer: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                />
              )}
              {kind === 'expression' && (
                <input
                  className="f-input font-mono"
                  placeholder="expression, e.g. (x+1)^2"
                  value={attempt.answer ?? ''}
                  disabled={submitted}
                  onChange={(e) => updateAttempt(attempt.id, { answer: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                />
              )}
              {kind === 'choice' && problem.answerSpec.kind === 'choice' && (
                <div className="space-y-1.5">
                  {problem.answerSpec.options.map((o, i) => {
                    const picked = (attempt.answerChoice ?? []).includes(i);
                    return (
                      <label key={i} className={cn('flex cursor-pointer items-center gap-2 rounded border px-2 py-1.5 text-[13px]', picked ? 'border-[var(--color-blueprint)] bg-[rgb(var(--blueprint-rgb)/0.08)]' : 'border-[var(--color-rule)]')}>
                        <input
                          type="checkbox"
                          checked={picked}
                          disabled={submitted}
                          onChange={() => {
                            const cur = new Set(attempt.answerChoice ?? []);
                            if (cur.has(i)) cur.delete(i);
                            else cur.add(i);
                            updateAttempt(attempt.id, { answerChoice: [...cur].sort((a, b) => a - b) });
                          }}
                        />
                        {o || <em className="text-[var(--color-ink-faint)]">empty option</em>}
                      </label>
                    );
                  })}
                </div>
              )}
              {kind === 'none' && problem.answerSpec.kind === 'steps' && (
                <StepChecklist attempt={attempt} disabled={submitted} onChange={(arr) => updateAttempt(attempt.id, { stepsChecked: arr })} steps={problem.answerSpec.steps} />
              )}
              {kind === 'none' && problem.answerSpec.kind === 'rubric' && rubric && (
                <RubricScorer attempt={attempt} rubric={rubric} disabled={submitted} onChange={(m) => updateAttempt(attempt.id, { rubricScores: m })} />
              )}
              {kind === 'none' && problem.answerSpec.kind === 'open' && (
                <div className="text-[12px] leading-snug text-[var(--color-ink-soft)]">
                  Open response — submit when done, then grade yourself against the worked solution.
                </div>
              )}
            </div>

            <div className="border-b border-[var(--color-rule)] px-4 py-3">
              <div className="kicker mb-2">hint ladder</div>
              <div className="space-y-1.5">
                {([1, 2, 3] as const).map((lvl) => {
                  const used = revealedHints.includes(lvl);
                  const hasText = !!problem.hints[lvl - 1]?.trim();
                  const isNext = attempt.hintLevel + 1 === lvl;
                  return (
                    <button
                      key={lvl}
                      className={cn('btn btn--hint w-full !justify-start !py-1.5 text-left', used && 'opacity-60')}
                      disabled={submitted || !isNext || !hasText}
                      onClick={() => revealHint(attempt.id)}
                      title={!hasText ? `no ${HINT_LABELS[lvl as 1 | 2 | 3]} filed` : used ? 'already revealed' : `reveal ${HINT_LABELS[lvl as 1 | 2 | 3]}`}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Lightbulb size={12} />
                        {used ? `${HINT_LABELS[lvl as 1 | 2 | 3]} — shown` : `reveal ${HINT_LABELS[lvl as 1 | 2 | 3]}`}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 text-[10.5px] leading-snug text-[var(--color-ink-faint)]">
                Each level reveals once and is recorded on the rail. The worked solution (level 4) only opens after submission.
              </div>
            </div>

            <div className="mt-auto px-4 py-3">
              <ConfidencePicker value={attempt.confidence} onChange={(n) => updateAttempt(attempt.id, { confidence: n })} />
              <button className="btn btn--blueprint mt-3 w-full" onClick={submit} disabled={submitted}>
                <span className="inline-flex items-center gap-1.5"><Send size={12} /> Submit for verification</span>
              </button>
              {verdict && <div className="mt-2 text-[11.5px] text-[var(--color-ink-soft)]">{verdict}</div>}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function StepEditor({
  step,
  readOnly,
  onChange,
}: {
  step: WorkStep;
  readOnly: boolean;
  onChange: (patch: Partial<WorkStep>) => void;
}) {
  const [mode, setMode] = useState<'write' | 'draw'>('write');
  const attach = (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      if (f.size > 600_000) continue;
      const r = new FileReader();
      r.onload = () => {
        onChange({ attachments: [...(step.attachments ?? []), { id: uid('f_'), name: f.name, mime: f.type, dataUrl: String(r.result) }] });
      };
      r.readAsDataURL(f);
    }
  };
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1">
        <span className="seg">
          <button type="button" className={mode === 'write' ? 'seg--on' : undefined} onClick={() => setMode('write')} disabled={readOnly}>write</button>
          <button type="button" className={mode === 'draw' ? 'seg--on' : undefined} onClick={() => setMode('draw')} disabled={readOnly}>
            <PenLine size={11} /> draw
          </button>
        </span>
        {!readOnly && (
          <label className="xbtn" title="Attach image to step (≤600KB)">
            <ImagePlus size={13} />
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => attach(e.target.files)} />
          </label>
        )}
      </div>
      {mode === 'write' ? (
        <textarea
          className="f-textarea font-mono text-[13px]"
          rows={4}
          value={step.text}
          disabled={readOnly}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder="Write this step — algebra lines, reasoning, $LaTeX$ welcome…"
        />
      ) : (
        <DrawPad
          paths={step.drawing ?? []}
          readOnly={readOnly}
          onChange={(paths) => onChange({ drawing: paths, drawW: 600, drawH: 220 })}
        />
      )}
      {step.drawing?.length ? (
        mode === 'write' && (
          <div className="mt-2">
            <div className="kicker mb-1">sketch on this step</div>
            <DrawPad paths={step.drawing} readOnly height={160} />
          </div>
        )
      ) : null}
      {step.attachments?.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {step.attachments.map((a) => (
            <img key={a.id} src={a.dataUrl} alt={a.name} className="max-h-32 rounded border border-[var(--color-rule)]" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StepChecklist({
  steps,
  attempt,
  disabled,
  onChange,
}: {
  steps: string[];
  attempt: Attempt;
  disabled: boolean;
  onChange: (checked: boolean[]) => void;
}) {
  const checked = attempt.stepsChecked ?? steps.map(() => false);
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] text-[var(--color-ink-soft)]">Check each milestone your work actually reached:</div>
      {steps.map((s, i) => (
        <label key={i} className="flex cursor-pointer items-start gap-2 text-[12.5px]">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={!!checked[i]}
            disabled={disabled}
            onChange={(e) => {
              const next = [...checked];
              next[i] = e.target.checked;
              onChange(next);
            }}
          />
          <span>{s}</span>
        </label>
      ))}
      <div className="pt-1 text-[11px] text-[var(--color-ink-faint)]">
        <CheckCheck size={11} className="mr-1 inline" />
        {checked.filter(Boolean).length}/{steps.length} milestones
      </div>
    </div>
  );
}

function RubricScorer({
  attempt,
  rubric,
  disabled,
  onChange,
}: {
  attempt: Attempt;
  rubric: { id: string; title: string; criteria: { id: string; text: string; requiredEvidence?: string }[]; levels: string[] };
  disabled: boolean;
  onChange: (scores: Record<string, number>) => void;
}) {
  const scores = attempt.rubricScores ?? {};
  return (
    <div className="space-y-2.5">
      <div className="text-[11px] text-[var(--color-ink-soft)]">Score your work on each criterion:</div>
      {rubric.criteria.map((c) => (
        <div key={c.id}>
          <div className="text-[12.5px] leading-snug">{c.text}</div>
          {c.requiredEvidence && <div className="text-[10.5px] italic text-[var(--color-ink-faint)]">needs: {c.requiredEvidence}</div>}
          <div className="mt-1 flex gap-1">
            {rubric.levels.map((lvl, i) => (
              <button
                key={i}
                type="button"
                disabled={disabled}
                className={cn('chip cursor-pointer', scores[c.id] === i && 'chip--violet !border-[var(--color-correct)]')}
                onClick={() => onChange({ ...scores, [c.id]: i })}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
