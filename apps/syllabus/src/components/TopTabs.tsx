export type ViewKey = 'today' | 'semester' | 'calendar' | 'review' | 'settings' | 'course';

const TABS: { key: ViewKey; label: string; hint: string }[] = [
  { key: 'today', label: 'Today', hint: 'T' },
  { key: 'semester', label: 'Semester', hint: 'E' },
  { key: 'calendar', label: 'Calendar', hint: 'C' },
  { key: 'review', label: 'Weekly', hint: 'W' },
  { key: 'settings', label: 'Registry', hint: ',' },
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
