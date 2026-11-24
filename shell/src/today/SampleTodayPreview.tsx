/* SampleTodayPreview — the landing page's "try it" surface.

   Rendered for '#/today?sample=1'. It shows what Today looks like with a
   real semester behind it — a Biology quiz due Friday and a focus block
   ready to start — without touching the workspace: no localStorage,
   IndexedDB or canonical-store writes happen here. The only way forward
   is an explicit "Load sample semester" (the same seed + reload path the
   Settings row and Today empty states use) or back out to the visitor's
   own Today. */
import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calendar,
  Clock,
  Play,
  Sparkles,
} from 'lucide-react';
import { isDemoLoaded, seedDemoSemester } from '../integration/demo';
import { Badge, Button, Dialog } from '../ui/primitives';
import { JournalMasthead, JournalSection } from './TodayJournalChrome';
import './today.css';

export function SampleTodayPreview({
  onGo,
  onEnter,
}: {
  onGo: (url: string) => void;
  onEnter: (id: string) => void;
}) {
  const [startOpen, setStartOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const demoLoaded = isDemoLoaded();

  /* seed + reload — mounted places hold their stores in memory, so only a
     reload rehydrates every surface from the seeded envelopes (the same
     contract TodayWorkspace's loadSampleSemester keeps). The hash is set
     first so the reload lands on the real Today, not back on this preview. */
  const loadSampleSemester = () => {
    if (seeding) return;
    setSeeding(true);
    setSeedError(null);
    void seedDemoSemester().then((r) => {
      if (r.ok) {
        window.location.hash = '/today';
        window.location.reload();
        return;
      }
      setSeeding(false);
      setSeedError(r.error || 'The sample semester did not finish loading — try again.');
    });
  };

  return (
    <div className="today-journal">
      <div className="today-wrap">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge tone="mono">Sample preview — nothing is saved</Badge>
          <Button variant="ghost" size="xs" icon={<ArrowLeft className="h-3.5 w-3.5" />} onClick={() => onGo('#/today')}>
            Back to my Today
          </Button>
        </div>

        <JournalMasthead courseLabel="Sample semester" />

        <JournalSection
          label="Suggested focus"
          title="Up next"
          kicker="Sample data"
        >
          <ul className="space-y-2.5">
            <li className="flex items-start justify-between gap-3 rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)] px-3.5 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13.5px] font-semibold text-[var(--color-ink)]">
                    Biology quiz prep · 20 min
                  </span>
                  <Badge tone="accent">Focus block</Badge>
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-mute)]">
                  Ready to start — the timer files the minutes back to Today when it ends.
                </p>
              </div>
              <Button variant="primary" size="sm" icon={<Play className="h-3.5 w-3.5" />} onClick={() => setStartOpen(true)}>
                Start
              </Button>
            </li>
            <li className="flex items-start gap-3 rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)] px-3.5 py-3">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-faint)]" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13.5px] font-semibold text-[var(--color-ink)]">
                    Biology quiz
                  </span>
                  <Badge tone="warn">Due Friday</Badge>
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-mute)]">
                  Cell respiration &amp; photosynthesis — chapters 6–8. The focus block above was planned from this deadline.
                </p>
              </div>
            </li>
          </ul>
        </JournalSection>

        <JournalSection
          label="How this preview works"
          title="Nothing here is yours yet"
          kicker="Honest preview"
        >
          <div className="space-y-2.5 text-[12.5px] leading-relaxed text-[var(--color-mute)]">
            <p className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent)]" />
              This is a sample of what Today looks like once a semester is behind it —
              deadlines turn into focus blocks, and focus blocks file their minutes back.
            </p>
            <p className="flex items-start gap-2">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent)]" />
              Starting the block here doesn&apos;t run a timer or save a session — it just
              shows you the flow. Your own workspace is untouched.
            </p>
            <p className="flex items-start gap-2">
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent)]" />
              Ready to keep exploring? Load the sample semester to fill your own Today
              with demo data you can poke at — or head back and start with a real course.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {demoLoaded ? (
              <Button variant="primary" size="sm" onClick={() => onGo('#/today')}>
                Open my Today <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button variant="primary" size="sm" icon={<Sparkles className="h-3.5 w-3.5" />} onClick={loadSampleSemester} disabled={seeding}>
                {seeding ? 'Loading sample semester…' : 'Load sample semester'}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => onEnter('syllabus')}>
              Set up my own courses
            </Button>
          </div>
          {seedError && (
            <p className="mt-3 text-[12px] text-[var(--color-bad)]">{seedError}</p>
          )}
        </JournalSection>
      </div>

      {/* Start explains itself instead of persisting — a preview can't
          honestly pretend to run a real session. */}
      <Dialog
        open={startOpen}
        onClose={() => setStartOpen(false)}
        title="Sample preview"
        subtitle="This block isn't connected to a real timer"
      >
        <div className="space-y-3 text-[13px] leading-relaxed text-[var(--color-mute)]">
          <p>
            In your own Today, pressing Start opens the focus timer and, when the
            minutes are up, files the session back here. This preview has no
            workspace behind it, so there&apos;s nothing to time or save.
          </p>
          <p>
            Want the real thing? Load the sample semester — it plants demo
            courses, deadlines and decks so every place has something to show,
            and you can remove it again from Settings → Data &amp; backup.
          </p>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {demoLoaded ? (
            <Button variant="primary" size="sm" onClick={() => onGo('#/today')}>
              Open my Today <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button variant="primary" size="sm" icon={<Sparkles className="h-3.5 w-3.5" />} onClick={loadSampleSemester} disabled={seeding}>
              {seeding ? 'Loading sample semester…' : 'Load sample semester'}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setStartOpen(false)}>
            Keep exploring
          </Button>
        </div>
        {seedError && (
          <p className="mt-3 text-[12px] text-[var(--color-bad)]">{seedError}</p>
        )}
      </Dialog>
    </div>
  );
}
