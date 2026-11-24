import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { PLACES } from '../places';
import type { IntakeWait, Presence } from '../hub';
import { Badge } from '../ui/primitives';

export type TodayView = 'day' | 'plans' | 'journal' | 'courses' | 'tools';

const STALE_MS = 35000;
const isStale = (p: Presence | undefined) => !p || Date.now() - p.at > STALE_MS;

function greetingFor(hour: number): string {
  if (hour < 5) return 'Up late';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/* Compact editorial masthead — date, greeting, and the active course lens.
   The ornament is deliberately small: a fleuron, not a hero. */
export function JournalMasthead({ courseLabel }: { courseLabel?: string }) {
  const now = new Date();
  const dateLine = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <header className="today-masthead">
      <div className="today-masthead-row">
        <div className="min-w-0">
          <p className="today-eyebrow">
            Today · {dateLine}
            {courseLabel ? ` · Lens: ${courseLabel}` : ''}
          </p>
          <h1 className="today-greeting">
            <span className="sr-only">Today — </span>
            {greetingFor(now.getHours())}
          </h1>
          <p className="today-deck">
            A quiet page for the day&apos;s work — focus, review, and the places that hold it.
          </p>
        </div>
      </div>
    </header>
  );
}

const VIEW_TABS: { id: TodayView; label: string; count?: 'courses' | 'journal' }[] = [
  { id: 'day', label: 'My day' },
  { id: 'plans', label: 'Plans' },
  { id: 'journal', label: 'Journal', count: 'journal' },
  { id: 'courses', label: 'Courses', count: 'courses' },
  { id: 'tools', label: 'Tools' },
];

export function JournalTabs({
  view,
  onChange,
  counts,
}: {
  view: TodayView;
  onChange: (view: TodayView) => void;
  counts: { courses: number; journal: number };
}) {
  const move = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'),
    );
    const index = tabs.indexOf(event.target as HTMLElement);
    if (index < 0) return;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    const tab = tabs[next];
    if (!tab) return;
    onChange(tab.dataset.view as TodayView);
    tab.focus();
  };

  return (
    <div role="tablist" aria-label="Today views" className="today-tabs" onKeyDown={move}>
      {VIEW_TABS.map((tab) => {
        const selected = view === tab.id;
        const count = tab.count ? counts[tab.count] : 0;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`today-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls="today-panel"
            data-view={tab.id}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className="today-tab"
          >
            <span>{tab.label}</span>
            {count > 0 && <span className="today-tab-count">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function JournalSection({
  label,
  title,
  kicker = 'Field notes',
  count,
  action,
  children,
  className = '',
}: {
  label: string;
  title: string;
  kicker?: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={label} className={`today-section ${className}`}>
      <header className="today-section-head">
        <div className="min-w-0">
          <p className="today-kicker">{kicker}</p>
          <div className="flex items-baseline gap-2">
            <h2 className="today-section-title">{title}</h2>
            {typeof count === 'number' && count > 0 && (
              <span className="today-section-count">{count}</span>
            )}
          </div>
        </div>
        {action && <div className="today-section-action-slot">{action}</div>}
      </header>
      <div className="today-sheet">{children}</div>
    </section>
  );
}

/* The nine places as a real directory — cards, not a horizontal strip. */
export function ToolsDirectory({
  presences,
  mounted = [],
  intakes,
  onEnter,
}: {
  presences: Record<string, Presence>;
  mounted?: string[];
  intakes?: Record<string, IntakeWait>;
  onEnter: (id: string) => void;
}) {
  return (
    <section aria-label="Workspace tools" className="today-tools">
      <div className="today-tools-intro">
        <p className="today-kicker">Directory</p>
        <h2 className="today-section-title">The nine places</h2>
        <p className="today-deck">
          Each place keeps its own work; Today only needs to know where to send you.
        </p>
      </div>
      <div className="today-tools-grid">
        {PLACES.map((place) => {
          const presence = presences[place.id];
          const stale = isStale(presence);
          const liveLines = !stale && presence?.summary ? place.today(presence.summary) : [];
          const waiting = intakes?.[place.id];
          const inMemory = mounted.includes(place.id);
          const statusLine = liveLines[0]?.text ?? place.shortDesc;

          return (
            <button
              key={place.id}
              type="button"
              onClick={() => onEnter(place.id)}
              className="today-tool-card"
            >
              <span className="today-tool-top">
                <span className="today-tool-glyph" aria-hidden="true">{place.glyph}</span>
                <ArrowUpRight className="h-4 w-4 text-[var(--color-faint)]" />
              </span>
              <span className="today-tool-name">{place.label}</span>
              <span className="today-tool-place">
                {place.place} · {place.app}
              </span>
              <span className="today-tool-desc">{statusLine}</span>
              <span className="today-tool-foot">
                {waiting && waiting.count > 0 ? (
                  <Badge tone={waiting.stuck ? 'bad' : 'warn'}>
                    {waiting.count} waiting
                  </Badge>
                ) : inMemory ? (
                  <span className="today-tool-live">In memory</span>
                ) : (
                  <span className="today-tool-live">Ready</span>
                )}
                <span className="today-tool-open">Open</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
