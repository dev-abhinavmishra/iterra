import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWorkbench, selectErrorsFor } from '../store';
import type { Attempt, AttemptResult, ErrorCategory } from '../lib/types';
import { autoCheck } from '../lib/checking';
import { flashcardsCardsLink, inkNoteMarkdown, misconceptionCard } from '../lib/links';
import { openDeep } from '../lib/iterra';
import { cn, fmtDateTime } from '../lib/utils';
import { DocView } from '../components/DocView';
import { DrawPad } from '../components/DrawPad';
import { ProofRail } from '../components/ProofRail';
import { RetestChip } from '../components/TerrainChips';
import type { ViewKey } from '../components/TopTabs';
import { CheckCircle2, Circle, ArrowRight, Download, Layers, NotebookPen, RotateCcw } from 'lucide-react';

const CATEGORIES: { key: ErrorCategory; label: string }[] = [
  { key: 'conceptual-gap', label: 'conceptual gap' },
  { key: 'wrong-strategy', label: 'wrong strategy' },
  { key: 'algebra-arithmetic', label: 'algebra / arithmetic' },
  { key: 'misread-prompt', label: 'misread prompt' },
  { key: 'incomplete-explanation', label: 'incomplete explanation' },
  { key: 'careless-execution', label: 'careless execution' },
  { key: 'none', label: 'no real error — got it' },
  { key: 'custom', label: 'custom' },
];

export function CompareView({
  attemptId,
  goView,
  goSession,
  onAttempt,
}: {
  attemptId: string;
  goView: (v: ViewKey) => void;
  goSession: (sessionId?: string) => void;
  onAttempt: (a: Attempt) => void;
}) {
  const attempt = useWorkbench((s) => s.attempts[attemptId]);
  // commons read: shared.deck — which deck our last export landed in (WIRING §7)
  const [landedDeck, setLandedDeck] = useState<string | null>(null);
  useEffect(() => {
    const doc = (window as any).iterra?.doc?.('shared');
    if (!doc) return;
    const read = (v: any) => {
      const e = v?.deck;
      const fresh = e && e.by === 'flashcards' && e.v && Number.isFinite(e.at) && Date.now() - e.at < 10 * 60 * 1000;
      setLandedDeck(fresh && typeof e.v.deck === 'string' && e.v.deck.startsWith('Proof —') ? e.v.deck : null);
    };
    read(doc.get());
    return doc.subscribe(read);
  }, []);
  const problem = useWorkbench((s) => (attempt ? s.problems[attempt.problemId] : undefined));
  const rubric = useWorkbench((s) =>
    problem?.answerSpec.kind === 'rubric' ? s.rubrics[problem.answerSpec.rubricId] : undefined,
  );
  const settings = useWorkbench((s) => s.settings);
  const updateAttempt = useWorkbench((s) => s.updateAttempt);
  const fileError = useWorkbench((s) => s.fileError);
  const updateError = useWorkbench((s) => s.updateError);
  const scheduleReview = useWorkbench((s) => s.scheduleReview);
  const errors = useWorkbench(useShallow((s) => selectErrorsFor(s, attempt?.problemId)));
  const startAttempt = useWorkbench((s) => s.startAttempt);

  const existing = errors.find((e) => e.attemptId === attemptId);
  const [category, setCategory] = useState<ErrorCategory | null>(existing?.category ?? null);
  const [customLabel, setCustomLabel] = useState(existing?.customLabel ?? '');
  const [divergence, setDivergence] = useState(existing?.divergence ?? '');
  const [repairCue, setRepairCue] = useState(existing?.repairCue ?? '');
  const [divergentSteps, setDivergentSteps] = useState<number[]>(existing?.divergentSteps ?? []);
  const [filed, setFiled] = useState(false);
  const [selfResult, setSelfResult] = useState<AttemptResult>(attempt?.result ?? 'partial');

  const verdict = useMemo(() => {
    if (!attempt || !problem) return null;
    return autoCheck(problem.answerSpec, attempt, rubric);
  }, [attempt, problem, rubric]);

  // label used by exports — may run before a category is picked
  const errorLabel = category === 'custom' ? customLabel : (category ?? 'unclassified');

  const toggleStep = (i: number) =>
    setDivergentSteps((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i].sort((a, b) => a - b)));

  const fileRecord = () => {
    if (!category) return;
    if (!attempt) return;
    const payload = {
      attemptId,
      category,
      customLabel: category === 'custom' ? customLabel : undefined,
      divergence,
      repairCue,
      divergentSteps,
    };
    if (existing) updateError(existing.id, payload);
    else fileError(payload);
    // grade + schedule
    const result = attempt.result ?? selfResult;
    if (!attempt.result) {
      updateAttempt(attemptId, { result, resultSource: 'self' });
    }
    scheduleReview(attempt.problemId, result, attempt.confidence, attemptId);
    setFiled(true);
  };

  const downloadInkNote = () => {
    if (!problem) return;
    const md = inkNoteMarkdown({
      title: `Correction — ${problem.topic}`,
      problem,
      divergence,
      repairCue,
      category: errorLabel,
    });
    const blob = new Blob([md], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${problem.topic || 'correction'}-for-ink.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const retryNow = () => {
    if (!problem) return;
    /* carry the session forward — a retry launched from compare used to
       silently leave the session runner's queue (sessionId loss) */
    const a = startAttempt(problem.id, attempt.sessionId);
    onAttempt(a);
  };

  /* Workflow: proof → folio — open the shared schedule-review modal bound
     to this exact problem (scheduleProblemRetry also stamps Proof's own
     spaced queue, so the two never diverge). */
  const planRetryInFolio = () => {
    if (!problem) return;
    const course = problem.courseId
      ? useWorkbench.getState().courses[problem.courseId]?.code
      : undefined;
    window.dispatchEvent(new CustomEvent('iterra:modal', {
      detail: {
        kind: 'schedule-review',
        materialRef: { app: 'proof', type: 'problem', id: problem.id },
        materialTitle: problem.topic || 'untitled problem',
        inheritedCourse: course,
        inheritedCourseId: problem.courseId || undefined,
        inheritedTopic: problem.topic || undefined,
        followUpForRef: `proof:attempt:${attemptId}`,
        defaultPhase: 'practice',
      },
    }));
  };

  if (!attempt || !problem) {
    return (
      <div className="mx-auto max-w-4xl p-10 text-center text-[var(--color-paper)]">
        Attempt not found.
        <button className="btn btn--ghost ml-3" onClick={() => goView('library')}>Back to library</button>
      </div>
    );
  }

  const needsSelfGrade = !attempt.result && verdict?.mode !== 'auto';
  const finalResult = attempt.result ?? (verdict?.mode === 'auto' ? verdict.result : selfResult);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16">
      <div className="pad mt-3 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="kicker">verifying the proof — {problem.topic || 'general'}</div>
            <div className="mt-1 text-[13px] text-[var(--color-ink-soft)]">
              Your attempt on the left, the worked proof on the right. It folds open now — your work is never overwritten.
            </div>
          </div>
          <div className="flex items-center gap-2">
            {finalResult && (
              <span
                className={cn(
                  'stamp stamp--in',
                  finalResult === 'correct' ? 'stamp--verified' : finalResult === 'partial' ? 'stamp--tentative' : 'stamp--broken',
                )}
              >
                {finalResult === 'correct' ? '✓ verified' : finalResult === 'partial' ? '◐ tentative' : '✕ broken'}
              </span>
            )}
            {verdict && attempt.resultSource === 'auto' && (
              <span className="chip" title={verdict.detail}>auto-checked</span>
            )}
          </div>
        </div>

        {needsSelfGrade && (
          <div className="hint-pane mb-4 px-3 py-2.5">
            <div className="mono mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-hint-deep)]">
              grade yourself against the worked proof
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['correct', 'partial', 'incorrect'] as AttemptResult[]).map((r) => (
                <button
                  key={r}
                  className={cn('chip cursor-pointer', selfResult === r && 'chip--violet !border-[var(--color-correct)]')}
                  onClick={() => setSelfResult(r)}
                >
                  {r === 'correct' ? '✓' : r === 'partial' ? '◐' : '✕'} {r}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {/* attempt side */}
          <div className="film rounded">
            <div className="border-b border-[var(--color-rule)] px-4 py-2.5">
              <div className="kicker">your proof — mark the assertion that broke</div>
            </div>
            <div className="flex">
              <div className="w-12 shrink-0 border-r border-[var(--color-rule)] pt-3">
                <ProofRail attempt={attempt} divergentSteps={divergentSteps} onStepClick={toggleStep} />
              </div>
              <div className="min-w-0 flex-1 space-y-3 p-4">
                {attempt.work.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleStep(i)}
                    className={cn(
                      'block w-full rounded border p-2.5 text-left transition-colors',
                      divergentSteps.includes(i)
                        ? 'border-[var(--color-correct)] bg-[rgb(var(--correct-rgb)/0.08)]'
                        : 'border-[var(--color-rule)] hover:border-[var(--color-correct)]',
                    )}
                    aria-pressed={divergentSteps.includes(i)}
                  >
                    <div className="mono mb-1 text-[9.5px] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
                      step {i + 1} {divergentSteps.includes(i) && '— divergent'}
                    </div>
                    {s.text.trim() ? <DocView doc={s.text} className="text-[13px]" /> : null}
                    {s.drawing?.length ? <DrawPad paths={s.drawing} readOnly height={140} /> : null}
                    {s.attachments?.map((a) => (
                      <img key={a.id} src={a.dataUrl} alt={a.name} className="mt-1 max-h-28 rounded border border-[var(--color-rule)]" />
                    ))}
                    {!s.text.trim() && !s.drawing?.length && !s.attachments?.length && (
                      <span className="text-[12px] italic text-[var(--color-ink-faint)]">empty step</span>
                    )}
                  </button>
                ))}
                <div className="rounded border border-[var(--color-rule)] p-2.5 text-[12px]">
                  <span className="kicker">final answer</span>
                  <div className="mt-1 font-mono">
                    {attempt.answer ??
                      (attempt.answerChoice?.length
                        ? `options ${attempt.answerChoice.map((i) => i + 1).join(', ')}`
                        : '—')}
                  </div>
                  <div className="mt-1 text-[10.5px] text-[var(--color-ink-faint)]">
                    confidence {attempt.confidence}/5 · hints to level {attempt.hintLevel}
                    {verdict?.detail ? ` · ${verdict.detail}` : ''}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* the worked proof side — folds open */}
          <div className="solution-pane solution-pane--in film rounded">
            <div className="border-b border-[var(--color-rule)] px-4 py-2.5">
              <div className="kicker">the worked proof</div>
            </div>
            <div className="p-4">
              {problem.workedSolutionDoc.trim() ? (
                <div><DocView doc={problem.workedSolutionDoc} className="text-[14px]" /><span className="qed" aria-label="quod erat demonstrandum" title="q.e.d." /></div>
              ) : (
                <div className="text-[12.5px] italic text-[var(--color-ink-soft)]">
                  No worked proof filed for this problem — grade against the expected answer
                  {problem.answerSpec.kind !== 'open' ? ' shown below' : ''}.
                </div>
              )}
              {problem.answerSpec.kind === 'exact' && (
                <div className="mt-3 rounded border border-[var(--color-rule)] p-2 text-[13px]">
                  <span className="kicker">expected</span>
                  <div className="font-mono">{problem.answerSpec.expected}</div>
                </div>
              )}
              {problem.answerSpec.kind === 'numeric' && (
                <div className="mt-3 rounded border border-[var(--color-rule)] p-2 text-[13px]">
                  <span className="kicker">expected</span>
                  <div className="font-mono">
                    {problem.answerSpec.value}
                    {problem.answerSpec.unit ? ' ' + problem.answerSpec.unit : ''}
                  </div>
                </div>
              )}
              {problem.answerSpec.kind === 'expression' && (
                <div className="mt-3 rounded border border-[var(--color-rule)] p-2 text-[13px]">
                  <span className="kicker">expected</span>
                  <div className="font-mono">{problem.answerSpec.expected}</div>
                </div>
              )}
              {(() => { const spec = problem.answerSpec; return spec.kind === 'choice' ? (
                <div className="mt-3 space-y-1">
                  {spec.options.map((o, i) => (
                    <div key={i} className="flex items-center gap-2 text-[13px]">
                      {spec.correct.includes(i) ? (
                        <CheckCircle2 size={13} className="text-[var(--color-blueprint)]" />
                      ) : (
                        <Circle size={13} className="text-[var(--color-ink-faint)]" />
                      )}
                      <span className={spec.correct.includes(i) ? 'font-medium' : ''}>{o}</span>
                    </div>
                  ))}
                </div>
              ) : null; })()}
              {problem.answerSpec.kind === 'steps' && (
                <div className="mt-3 space-y-1.5">
                  {problem.answerSpec.steps.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 text-[13px]">
                      <span className="rail-node !h-[20px] !w-[20px] !text-[9px]">{i + 1}</span>
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── reflection + classification ── */}
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="film rounded p-4">
            <div className="kicker mb-2">reflect — two short answers</div>
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-medium">Where did your approach diverge?</span>
              <textarea
                className="f-textarea"
                rows={3}
                value={divergence}
                onChange={(e) => setDivergence(e.target.value)}
                placeholder="e.g. I isolated v before squaring; the worked version squares first…"
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-[12.5px] font-medium">What cue should you notice next time?</span>
              <textarea
                className="f-textarea"
                rows={3}
                value={repairCue}
                onChange={(e) => setRepairCue(e.target.value)}
                placeholder="e.g. when both sides have v, try squaring before isolating…"
              />
            </label>
          </div>
          <div className="film rounded p-4">
            <div className="kicker mb-2">classify the break</div>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  className={cn('chip cursor-pointer', category === c.key && 'chip--violet !border-[var(--color-correct)]')}
                  onClick={() => setCategory(c.key)}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {category === 'custom' && (
              <input
                className="f-input mt-2"
                placeholder="name the category"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
              />
            )}
            <div className="mt-3 text-[11.5px] leading-snug text-[var(--color-ink-soft)]">
              Filing this record schedules a retry on the spaced queue
              {finalResult !== 'correct' ? ' (miss → due tomorrow)' : ' (success → interval grows)'} —
              {attempt.result ? ' and keeps your grade.' : ' your self-grade will be stamped.'}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn btn--correct" onClick={fileRecord} disabled={!category || (category === 'custom' && !customLabel.trim())}>
                {existing ? 'Update record' : 'File record + schedule retry'}
              </button>
              <button
                className="btn btn--ghost"
                title="Send an atomic misconception card to Flashcards"
                onClick={() => {
                  const card = misconceptionCard({
                    category: errorLabel,
                    repairCue: repairCue || divergence || problem.topic,
                    problem,
                  });
                  const title = `Proof — ${problem.topic} misconceptions`;
                  const course = problem.courseId
                    ? useWorkbench.getState().courses[problem.courseId]?.code
                    : undefined;
                  const url = flashcardsCardsLink(settings, [card], title, course);
                  openDeep(url);
                  (window as any).iterra?.feed?.({ text: `exported deck: ${title}`, url, course });
                }}
                disabled={!repairCue.trim() && !divergence.trim()}
              >
                <span className="inline-flex items-center gap-1.5"><Layers size={12} /> Card → Flashcards</span>
              </button>
              <button className="btn btn--ghost" title="Download a Markdown note for Ink" onClick={downloadInkNote}>
                <span className="inline-flex items-center gap-1.5"><NotebookPen size={12} /> Note → Ink</span>
              </button>
              <button className="btn btn--ghost" title="Copy correction note to clipboard" onClick={() => navigator.clipboard.writeText(inkNoteMarkdown({ title: `Correction — ${problem.topic}`, problem, divergence, repairCue, category: errorLabel }))}>
                <Download size={12} />
              </button>
            </div>
            {landedDeck && (
              <div className="mt-2 text-[10.5px] text-[var(--color-ink-faint)]">last export → {landedDeck}</div>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11.5px] text-[var(--color-ink-faint)]">
            <span>
              {filed ? '✓ record filed — retry scheduled on the queue' : 'file the record to schedule the retry'}
              {existing && ` · filed ${fmtDateTime(existing.createdAt)}`}
            </span>
            {/* the filed error's retest card lives in flashcards — surface
                its live link here, the one place a submitted attempt is
                viewed (the desk chip only ever sees open attempts) */}
            <RetestChip attemptId={attemptId} />
          </div>
          <div className="flex gap-2">
            <button className="btn btn--ghost" onClick={retryNow}>
              <span className="inline-flex items-center gap-1.5"><RotateCcw size={12} /> Retry now</span>
            </button>
            {(window as any).__iterraIntegrated && (
              <button className="btn btn--ghost" onClick={planRetryInFolio} title="Schedule a linked retry block in the Planning folio">
                <span className="inline-flex items-center gap-1.5"><ArrowRight size={12} /> Plan retry</span>
              </button>
            )}
            <button className="btn btn--blueprint" onClick={() => (attempt.sessionId ? goSession(attempt.sessionId) : goView('library'))}>
              {attempt.sessionId ? 'Back to session' : 'Back to library'} <ArrowRight size={12} className="ml-1 inline" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
