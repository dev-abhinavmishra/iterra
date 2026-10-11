import type { Attempt, HintLevel } from '../lib/types';
import { cn } from '../lib/utils';

/**
 * The proof rail — the workbench signature element.
 * A vertical hairline of numbered step nodes; the confidence tick sits at
 * the head, hint reveals appear as amber pips at the moment they were used.
 */
export function ProofRail({
  attempt,
  divergentSteps = [],
  activeStep,
  onStepClick,
}: {
  attempt: Attempt;
  divergentSteps?: number[];
  activeStep?: number;
  onStepClick?: (index: number) => void;
}) {
  const steps = attempt.work;
  const hintPips = attempt.hintReveals.map((h) => h.level);
  const concluded = !!(attempt.answer?.trim() || attempt.answerChoice?.length || attempt.rubricScores || attempt.stepsChecked);
  return (
    <div className="rail rail--draw flex flex-col items-center gap-1.5 py-1" aria-label="Proof rail — the spine of your proof">
      <span
        className="rail-conf mb-1"
        title={`confidence recorded before submission: ${attempt.confidence} of 5`}
        aria-label={`confidence ${attempt.confidence} of 5`}
      >
        <i>⊢</i>
        {attempt.confidence}
      </span>
      {steps.map((s, i) => {
        const divergent = divergentSteps.includes(i);
        const hasContent = !!(s.text.trim() || s.drawing?.length || s.attachments?.length);
        return (
          <button
            key={s.id}
            type="button"
            className={cn(
              'rail-node',
              hasContent && 'rail-node--filled',
              divergent && 'rail-node--divergent',
              activeStep === i && 'ring-2 ring-[rgb(var(--blueprint-rgb)/0.5)]',
            )}
            onClick={() => onStepClick?.(i)}
            aria-label={`Assertion ${i + 1}${divergent ? ', marked where the proof breaks' : ''}`}
            style={{ animationDelay: `${i * 40}ms` }}
          >
            {i + 1}
          </button>
        );
      })}
      {/* the therefore-node — the proof's conclusion */}
      <span
        className={cn('rail-node rail-node--therefore', concluded && 'rail-node--filled')}
        title={concluded ? 'conclusion stated' : 'conclusion not yet stated'}
        aria-label={`conclusion ${concluded ? 'stated' : 'empty'}`}
        style={{ animationDelay: `${steps.length * 40}ms` }}
      >
        ∴
      </span>
      {hintPips.length > 0 && (
        <div className="mt-1 flex flex-col items-center gap-1" aria-label={`hints used: levels ${hintPips.join(', ')}`}>
          {hintPips.map((lvl, i) => (
            <span
              key={`${lvl}-${i}`}
              className="rail-node rail-node--hint !h-[22px] !w-[22px] !text-[9px]"
              title={`Hint level ${lvl} revealed`}
            >
              h{lvl}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Confidence selector — recorded before submission, shown as the rail tick. */
export function ConfidencePicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Confidence before submission" className="flex items-center gap-1">
      <span className="f-label mr-2 !mb-0">confidence</span>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          className={cn(
            'rail-node !h-[30px] !w-[30px] cursor-pointer transition-colors',
            value === n && 'rail-node--correct',
          )}
          onClick={() => onChange(n)}
          title={['', 'guessing', 'unsure', 'maybe', 'fairly sure', 'certain'][n]}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export const HINT_LABELS: Record<HintLevel, string> = {
  0: 'no hints',
  1: 'concept cue',
  2: 'setup cue',
  3: 'next-step cue',
  4: 'worked solution',
};
