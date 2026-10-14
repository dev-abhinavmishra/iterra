import { Moon, Settings2, Sun, ChevronRight } from 'lucide-react';
import { PLACES } from '../places';
import { SectionHeader } from '../ui/primitives';
import { useWorkspaceTheme } from '../ui/theme';

/* Central settings — the one doorway for terrain preferences and every
   tool's settings. Per-app settings chrome is hidden while integrated;
   each row here deep-links straight into that tool's settings view so
   nothing is unreachable, it just isn't duplicated across eight apps. */

const SETTINGS_TARGET: Record<string, string> = {
  timer: '#/p/timer?settings',
  ink: '#/p/ink?settings',
  rhythm: '#/p/rhythm?settings',
  proof: '#/p/proof?settings',
  syllabus: '#/p/syllabus?settings',
  gradestack: '#/p/gradestack?p=settings',
  margin: '#/p/margin?settings',
  flashcards: '#/p/flashcards?settings',
};

const SETTINGS_NOTE: Record<string, string> = {
  timer: 'Session defaults, sound, motion',
  ink: 'Editor density, autosave, desk behavior',
  rhythm: 'Routines, week shape, experiments',
  proof: 'Session length, review cadence, motion',
  syllabus: 'Study window, block size, semester',
  gradestack: 'Answer key, rubric, roster defaults',
  margin: 'Titles, format, editor size, transcription',
  flashcards: 'Keyboard map — theme and motion live here in the terrain',
};

export function SettingsSurface({ onGo }: { onGo: (url: string) => void }) {
  const [theme, setTheme] = useWorkspaceTheme();
  const dark = theme === 'graphite';

  return (
    <div className="mx-auto max-w-[720px] px-6 py-8">
      <div className="flex items-center gap-2.5">
        <Settings2 className="h-5 w-5 text-[var(--color-accent)]" strokeWidth={1.8} />
        <h1 className="text-[19px] font-semibold tracking-tight text-[var(--color-ink)]">
          Settings
        </h1>
      </div>
      <p className="mt-1 text-[13px] text-[var(--color-mute)]">
        One place for the terrain and every tool — each row opens that tool's
        settings straight where they live.
      </p>

      {/* Terrain */}
      <section className="pt-6">
        <SectionHeader title="Terrain" />
        <button
          type="button"
          onClick={() => setTheme()}
          className="flex w-full items-center justify-between gap-4 rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)] px-4 py-3 text-left hover:border-[var(--color-accent)] cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-[5px] bg-[var(--color-sheet-2)] text-[var(--color-mute)]">
              {dark ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4" />
              )}
            </div>
            <div>
              <div className="text-[13.5px] font-semibold text-[var(--color-ink)]">
                Theme — {dark ? 'Graphite' : 'Paper'}
              </div>
              <div className="text-[12px] text-[var(--color-mute)]">
                One flick restyles the whole terrain — every tool follows.
              </div>
            </div>
          </div>
          <span
            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
              dark ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-line)]'
            }`}
            role="switch"
            aria-checked={dark}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-[var(--color-sheet)] shadow transition-transform ${
                dark ? 'translate-x-[18px] left-0' : 'left-0.5'
              }`}
            />
          </span>
        </button>
      </section>

      {/* Tools */}
      <section className="pt-6">
        <SectionHeader title="Tool settings" />
        <div className="overflow-hidden rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)]">
          {PLACES.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onGo(SETTINGS_TARGET[p.id] || `#/p/${p.id}`)}
              className={`group flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--color-sheet-hover)] cursor-pointer ${
                i > 0 ? 'border-t border-[var(--color-line)]' : ''
              }`}
            >
              <span className="h-4 w-4 shrink-0 text-[var(--color-accent)] [&>svg]:h-full [&>svg]:w-full">
                {p.glyph}
              </span>
              <span className="w-24 shrink-0 text-[13px] font-medium text-[var(--color-ink)]">
                {p.label}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--color-mute)]">
                {SETTINGS_NOTE[p.id] || p.shortDesc}
              </span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-faint)] group-hover:text-[var(--color-accent)] transition-colors" />
            </button>
          ))}
        </div>
      </section>

      {/* Getting started */}
      <section className="pt-6">
        <SectionHeader title="Learn" />
        <button
          type="button"
          onClick={() => onGo('#/c/unfiled')}
          className="flex w-full items-center justify-between gap-4 rounded-[6px] border border-[var(--color-line)] bg-[var(--color-sheet)] px-4 py-3 text-left hover:border-[var(--color-accent)] cursor-pointer"
        >
          <div>
            <div className="text-[13.5px] font-semibold text-[var(--color-ink)]">
              Getting Started
            </div>
            <div className="text-[12px] text-[var(--color-mute)]">
              Guides for every tool — the first three moves in each.
            </div>
          </div>
          <span className="text-[12px] font-medium text-[var(--color-accent)]">Open →</span>
        </button>
      </section>
    </div>
  );
}
