import { isIntegrated } from '../../theme';

export type ViewKey = 'today' | 'semester' | 'calendar' | 'review' | 'settings' | 'course';

/* settings live in the terrain's central surface when integrated — the
   Registry tab still deep-links via #/p/syllabus?settings */
const TABS: { key: ViewKey; label: string; hint: string }[] = [
  { key: 'today', label: 'Today', hint: 'T' },
  { key: 'semester', label: 'Semester', hint: 'E' },
  { key: 'calendar', label: 'Calendar', hint: 'C' },
  { key: 'review', label: 'Weekly', hint: 'W' },
  ...(isIntegrated() ? [] : [{ key: 'settings' as const, label: 'Registry', hint: ',' }]),
];

export function TopTabs({ view, onNav }: { view: ViewKey; onNav: (v: ViewKey) => void }) {
  return (
    <nav aria-label="Folio sections" className="flex gap-0.5 overflow-x-auto">
      {TABS.map((t) => (
        <button
          key={t.key}
          className={`dtab ${view === t.key ? 'dtab--on' : ''}`}
          onClick={() => onNav(t.key)}
          aria-current={view === t.key ? 'page' : undefined}
          title={`${t.label} — press ${t.hint}`}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
