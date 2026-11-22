import { Menu } from 'lucide-react';

export function MobileHeader({ title, onMenuClick }: { title: string; onMenuClick: () => void }) {
  return (
    <header className="md:hidden bg-form border-b border-hairline flex justify-between items-center w-full h-14 px-5 z-10 sticky top-0 shrink-0">
      <h1 className="font-display text-xl font-semibold text-ink">{title}</h1>
      <button type="button" className="text-pencil hover:text-ink transition-colors p-2" onClick={onMenuClick} aria-label="Assessment menu">
        <Menu size={22} aria-hidden="true" />
      </button>
    </header>
  );
}
