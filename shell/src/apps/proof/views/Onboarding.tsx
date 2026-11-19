import type { ViewKey } from '../components/TopTabs';
import { Layers, Lightbulb, RotateCcw, ClipboardList } from 'lucide-react';

/** First-run sheet — empty state, no seed data. The bank starts empty by design. */
export function Onboarding({ goView, onAddProblem }: { goView: (v: ViewKey) => void; onAddProblem: () => void }) {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-16">
      <div className="pad mt-4 p-5 sm:mt-8 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded bg-[var(--color-blueprint)] text-[var(--terrain-accent-text,#fff)]">
            <svg width="24" height="24" viewBox="0 0 15 15" aria-hidden="true">
            <path d="M4 2v11M4 7.5h7" stroke="currentColor" strokeWidth="2" strokeLinecap="square" fill="none" />
          </svg>
          </span>
          <div>
            <div className="serif text-[24px] font-semibold">Proof</div>
            <div className="kicker">problem practice</div>
          </div>
        </div>
        <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--color-ink-soft)] sm:mt-4 sm:text-[14px]">
          Practice solving problems before you look at the solution. Show your work, use a hint
          when you need one, then compare your answer with the worked solution and record what
          went wrong. Problems return when they are due for review.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 sm:mt-6 sm:gap-3">
          <button className="btn btn--blueprint" onClick={onAddProblem}>Add your first problem</button>
          <button className="btn btn--ghost" onClick={() => goView('import')}>Import a worksheet</button>
        </div>
        <div className="mt-4 grid gap-2 sm:mt-5 sm:grid-cols-2 sm:gap-3">
          <div className="film rounded p-3 sm:p-3.5">
            <ClipboardList size={15} className="text-[var(--color-blueprint)]" />
            <div className="mt-1.5 text-[13px] font-medium">Add problems</div>
            <div className="text-[12px] text-[var(--color-ink-soft)]">Write questions with Markdown or LaTeX, add hints, and choose how to check answers.</div>
          </div>
          <div className="film rounded p-3 sm:p-3.5">
            <Lightbulb size={15} className="text-[var(--color-hint)]" />
            <div className="mt-1.5 text-[13px] font-medium">Try it before checking</div>
            <div className="text-[12px] text-[var(--color-ink-soft)]">Show your work, rate your confidence, and reveal hints only when you need them.</div>
          </div>
          <div className="film rounded p-3 sm:p-3.5">
            <Layers size={15} className="text-[var(--color-correct)]" />
            <div className="mt-1.5 text-[13px] font-medium">Review your work</div>
            <div className="text-[12px] text-[var(--color-ink-soft)]">Compare your steps with the solution, record what went wrong, and send a reminder to Flashcards or Ink.</div>
          </div>
          <div className="film rounded p-3 sm:p-3.5">
            <RotateCcw size={15} className="text-[var(--color-blueprint)]" />
            <div className="mt-1.5 text-[13px] font-medium">Practice again later</div>
            <div className="text-[12px] text-[var(--color-ink-soft)]">Missed problems return for review. Mixed sessions help you choose the right method.</div>
          </div>
        </div>
        <div className="mt-3 text-[11.5px] text-[var(--color-ink-faint)] sm:mt-4">
          Your work is saved on this device. You can export a full backup from Settings at any time.
        </div>
      </div>
    </div>
  );
}
