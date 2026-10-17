import { Icon } from './ui';

export function MobileHeader({ title, onMenuClick }: { title: string; onMenuClick: () => void }) {
  return (
    <header className="md:hidden bg-form border-b border-hairline flex justify-between items-center w-full h-14 px-5 z-10 sticky top-0 shrink-0">
      <h1 className="font-display text-xl font-semibold text-ink">{title}</h1>
      <button className="text-pencil hover:text-ink transition-colors p-2" onClick={onMenuClick} title="Menu">
        <Icon name="menu" size={22} />
      </button>
    </header>
  );
}
