import type { ViewKey } from '../components/TopTabs';
import { Layers, Lightbulb, RotateCcw, ClipboardList } from 'lucide-react';

/** First-run sheet — empty state, no seed data. The bank starts empty by design. */
export function Onboarding({ goView }: { goView: (v: ViewKey) => void }) {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-16">
      <div className="pad mt-8 p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded bg-[var(--color-bench)] text-[var(--color-paper)]">
            <svg width="24" height="24" viewBox="0 0 15 15" aria-hidden="true">
            <path d="M4 2v11M4 7.5h7" stroke="currentColor" strokeWidth="2" strokeLinecap="square" fill="none" />
          </svg>
          </span>
          <div>
            <div className="serif text-[24px] font-semibold">Proof</div>
            <div className="kicker">calculation workbench</div>
          </div>
        </div>
        <p className="mt-4 text-[14px] leading-relaxed text-[var(--color-ink-soft)]">
          Practice solving problems — not reading solutions. Write your attempt step by step,
          reveal hints only when you have to, then compare against the worked answer and file
          the mistake. The queue schedules your retry on its own.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="film rounded p-3.5">
            <ClipboardList size={15} className="text-[var(--color-blueprint)]" />
            <div className="mt-1.5 text-[13px] font-medium">File problems</div>
            <div className="text-[12px] text-[var(--color-ink-soft)]">Markdown + LaTeX prompts, hint ladders, deterministic answer checks — exact, numeric+units, expressions, choice, rubric, or open.</div>
          </div>
          <div className="film rounded p-3.5">
            <Lightbulb size={15} className="text-[var(--color-hint)]" />
            <div className="mt-1.5 text-[13px] font-medium">Attempt first</div>
            <div className="text-[12px] text-[var(--color-ink-soft)]">Steps on the proof rail, confidence recorded before submission, hints revealed one level at a time — and logged.</div>
          </div>
          <div className="film rounded p-3.5">
            <Layers size={15} className="text-[var(--color-correct)]" />
            <div className="mt-1.5 text-[13px] font-medium">Compare + classify</div>
            <div className="text-[12px] text-[var(--color-ink-soft)]">Your work stays beside the worked solution. Mark the divergent step, name the error class, export the cue to Flashcards or Ink.</div>
          </div>
          <div className="film rounded p-3.5">
            <RotateCcw size={15} className="text-[var(--color-blueprint)]" />
            <div className="mt-1.5 text-[13px] font-medium">The queue schedules it</div>
            <div className="text-[12px] text-[var(--color-ink-soft)]">Misses file a spaced retry; interleaved sessions force method choice instead of pattern repetition.</div>
          </div>
        </div>
        <div className="mt-6 flex items-center gap-3">
          <button className="btn btn--blueprint" onClick={() => goView('library')}>File your first problem</button>
          <button className="btn btn--ghost" onClick={() => goView('import')}>Import a worksheet</button>
        </div>
        <div className="mt-4 text-[11.5px] text-[var(--color-ink-faint)]">
          Local-first — everything lives in this browser, offline. Export a full backup from Settings anytime.
        </div>
      </div>
    </div>
  );
}
