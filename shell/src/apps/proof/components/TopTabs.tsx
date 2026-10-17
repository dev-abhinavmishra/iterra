import { cn } from '../lib/utils';
import type { RouteState } from '../App';
import { HelpCircle } from 'lucide-react';
import { isIntegrated } from '../../theme';

/** Turnstile ⊢ — the app mark: a proof asserting its conclusion. */
function Turnstile() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
      <path d="M4 2v11M4 7.5h7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" fill="none" />
    </svg>
  );
}

export type ViewKey =
  | 'library'
  | 'session'
  | 'attempt'
  | 'compare'
  | 'ledger'
  | 'progress'
  | 'import'
  | 'settings';

const TABS: { key: ViewKey; label: string; kbd: string }[] = [
  { key: 'library', label: 'Library', kbd: 'L' },
  { key: 'session', label: 'Session', kbd: 'S' },
  { key: 'ledger', label: 'Error ledger', kbd: 'E' },
  { key: 'progress', label: 'Progress', kbd: 'P' },
  { key: 'import', label: 'Import', kbd: 'I' },
];

export function TopTabs({
  route,
  goView,
  due,
  onHelp,
}: {
  route: RouteState;
  goView: (v: ViewKey) => void;
  due: number;
  onHelp: () => void;
}) {
  return (
    /* flex-wrap: at phone widths the nav row (~640px) can't shrink — wrap
       the tab strip under the mark instead of pushing the page sideways */
    <header className="no-print flex flex-wrap items-end justify-between gap-x-5 gap-y-1 px-5 pt-3" role="banner">
      <div className="flex min-w-0 flex-wrap items-center gap-x-5">
        <div className="flex items-center gap-2.5 pb-1">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-[var(--color-paper)] text-[var(--color-blueprint-deep)]">
            <Turnstile />
          </span>
          <span className="serif text-[19px] font-semibold tracking-wide text-[var(--color-paper)]">
            Proof
          </span>
          <span className="mono mt-0.5 text-[9px] font-medium uppercase tracking-[0.18em] text-[rgb(244_242_234/0.4)]">
            calculation workbench
          </span>
        </div>
        <nav className="flex flex-wrap items-end gap-0.5" aria-label="Views">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={cn('dtab', route.view === t.key && 'dtab--on')}
              onClick={() => goView(t.key)}
              aria-current={route.view === t.key ? 'page' : undefined}
            >
              {t.label}
              {t.key === 'session' && due > 0 && (
                <span className="ml-1.5 rounded-full border border-[rgb(var(--correct-rgb)/0.6)] px-1.5 text-[9px] text-[rgb(244_242_234/0.75)] dtab--on:text-[var(--color-correct-deep)]">
                  {due}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-1 pb-1">
        {/* settings live in the terrain's central surface when integrated —
            still reachable via #/p/proof?settings */}
        {!isIntegrated() && (
          <button className="dtab" onClick={() => goView('settings')} aria-current={route.view === 'settings' ? 'page' : undefined}>
            Settings
          </button>
        )}
        <button className="xbtn text-[rgb(244_242_234/0.6)] hover:text-[var(--color-paper)]" onClick={onHelp} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
          <HelpCircle size={16} />
        </button>
      </div>
    </header>
  );
}
