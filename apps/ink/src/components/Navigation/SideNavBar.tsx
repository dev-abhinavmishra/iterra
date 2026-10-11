import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import {
  Notebook, Sun, Star, History, Tags, Crosshair, BarChart3,
  Folder, FolderPlus, Trash2, Settings, Spline,
} from 'lucide-react';
import { useStore } from '../../store';
import { SettingsPopover } from '../SettingsPopover';
import { todayKey } from '../../lib/notes';
import { useNow } from '../../lib/useNow';
import { InkBlot, InkWell, PenNib, Squiggle } from '../../lib/ink';

const primaryItems = [
  { to: '/',         icon: Notebook,  label: 'All Notes' },
  { to: '/favorites',icon: Star,      label: 'Favorites' },
  { to: '/recent',   icon: History,   label: 'Recent' },
];

const libraryItems = [
  { to: '/tags',     icon: Tags,      label: 'Tags' },
  { to: '/focus',    icon: Crosshair, label: 'Deep work' },
  { to: '/web',      icon: Spline,    label: 'Ink web' },
  { to: '/insights', icon: BarChart3, label: 'Insights' },
];

const countFor = (to: string, notes: { isPinned: boolean; trashedAt: number | null }[]) => {
  const live = notes.filter(n => !n.trashedAt);
  if (to === '/') return live.length;
  if (to === '/favorites') return live.filter(n => n.isPinned).length;
  return null;
};

export const SideNavBar: React.FC = () => {
  const { notes, folders, activeFolder, addNote, setActiveFolder, ensureDailyNote, addFolder } = useStore();
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = React.useState(false);
  const [folderName, setFolderName] = React.useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const now = useNow(60_000);
  const today = todayKey(new Date(now));
  const inkedToday = notes.filter(n => !n.trashedAt && todayKey(new Date(n.lastModified)) === today).length;
  // Every save lands a drop in the well. A timestamp can't be the pulse —
  // an imported page with a future date would freeze it forever — so the
  // store keeps a monotonic write counter instead.
  const lastWrite = useStore(s => s.writeSeq);

  const submitFolder = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = folderName.trim();
    if (name) addFolder(name);
    setFolderName('');
    setFolderDialogOpen(false);
  };

  const navRow = (item: { to: string; icon: React.ElementType; label: string }) => {
    const Icon = item.icon;
    const count = countFor(item.to, notes);
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.to === '/'}
        className={({ isActive }) => clsx(
          'group relative flex items-center gap-2.5 pl-4 pr-3 py-[7px] rounded text-[13px] transition-colors',
          isActive ? 'bg-paper text-ink font-medium shadow-[0_0_0_1px_var(--color-line)]' : 'ink-bleed text-ink-faint hover:text-ink'
        )}
      >
        {({ isActive }) => (
          <>
            {isActive && <span className="margin-mark" />}
            <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={isActive ? 2 : 1.75} />
            <span className="relative flex-1 truncate">
              {item.label}
              {isActive && <Squiggle seed={`nav:${item.to}`} width={56} className="absolute -bottom-[3px] left-0 h-[6px] opacity-70" draw />}
            </span>
            {count !== null && <span className="font-mono text-2xs text-ink-ghost tabular-nums">{count}</span>}
          </>
        )}
      </NavLink>
    );
  };

  return (
    <aside className="hidden md:flex flex-col h-full w-[232px] lg:w-[248px] flex-shrink-0 bg-desk border-r border-line select-none">
      {/* Wordmark — the period is a drop of ink that fell */}
      <div className="flex items-baseline gap-1.5 px-5 pt-6 pb-5">
        <span className="font-serif text-[26px] font-bold tracking-tight text-ink leading-none">
          Ink<InkBlot seed="ink-wordmark" size={10} satellites={0} color="var(--color-pencil)" opacity={1} className="inline-block ml-px -mb-px blot-in" />
        </span>
        <span className="font-mono text-2xs text-ink-ghost">a writing desk</span>
      </div>

      {/* Write — dip the pen */}
      <div className="px-4 pb-4">
        <button
          onClick={() => addNote()}
          className="w-full flex items-center justify-center gap-2 bg-ink text-paper text-[13px] font-medium py-2 rounded hover:bg-ink-soft transition-colors active:translate-y-px"
        >
          <PenNib className="w-4 h-4 -rotate-45" strokeWidth={2} />
          Write
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto custom-scrollbar px-2 space-y-px">
        {navRow(primaryItems[0])}
        {/* Today — a route-like button since it ensures a note */}
        <button
          onClick={() => { ensureDailyNote(); if (location.pathname !== '/') navigate('/'); }}
          className="ink-bleed group relative w-full flex items-center gap-2.5 pl-4 pr-3 py-[7px] rounded text-[13px] text-ink-faint hover:text-ink transition-colors"
        >
          <Sun className="w-4 h-4 flex-shrink-0" strokeWidth={1.75} />
          <span className="flex-1 text-left truncate">Today</span>
        </button>
        {primaryItems.slice(1).map(navRow)}

        {/* Folders */}
        <div className="flex items-center justify-between px-3 pt-5 pb-1.5">
          <span className="text-[11px] font-medium text-ink-ghost">Folders</span>
          <button
            onClick={() => { setFolderName(''); setFolderDialogOpen(true); }}
            aria-label="New folder"
            className="text-ink-ghost hover:text-ink transition-colors p-0.5 rounded"
          >
            <FolderPlus className="w-3.5 h-3.5" strokeWidth={1.75} />
          </button>
        </div>
        {folders.map(folder => {
          const isActive = activeFolder === folder.name && location.pathname === '/';
          return (
            <button
              key={folder.id}
              onClick={() => { setActiveFolder(folder.name); if (location.pathname !== '/') navigate('/'); }}
              className={clsx(
                'group relative w-full flex items-center gap-2.5 pl-4 pr-3 py-[6px] rounded text-[13px] transition-colors',
                isActive ? 'bg-paper text-ink font-medium shadow-[0_0_0_1px_var(--color-line)]' : 'ink-bleed text-ink-faint hover:text-ink'
              )}
            >
              {isActive && <span className="margin-mark" />}
              <Folder className={clsx('w-4 h-4 flex-shrink-0', isActive ? 'text-manila' : 'text-ink-ghost')} strokeWidth={1.75} />
              <span className="flex-1 text-left truncate">{folder.name}</span>
              <span className="font-mono text-2xs text-ink-ghost tabular-nums">
                {notes.filter(n => !n.trashedAt && n.folder === folder.name).length}
              </span>
            </button>
          );
        })}

        {/* Library */}
        <div className="px-3 pt-5 pb-1.5">
          <span className="text-[11px] font-medium text-ink-ghost">Library</span>
        </div>
        {libraryItems.map(navRow)}
      </nav>

      {/* Desk bottom — trash, settings, the writer */}
      <div className="px-2 pt-3 pb-4 border-t border-line space-y-px mt-2">
        <NavLink
          to="/trash"
          className={({ isActive }) => clsx(
            'group relative flex items-center gap-2.5 pl-4 pr-3 py-[7px] rounded text-[13px] transition-colors',
            isActive ? 'bg-paper text-ink font-medium shadow-[0_0_0_1px_var(--color-line)]' : 'ink-bleed text-ink-faint hover:text-ink'
          )}
        >
          {({ isActive }) => (
            <>
              {isActive && <span className="margin-mark" />}
              <Trash2 className="w-4 h-4 flex-shrink-0" strokeWidth={isActive ? 2 : 1.75} />
              <span className="flex-1 truncate">Wastebasket</span>
              {notes.filter(n => n.trashedAt).length > 0 && (
                <span className="font-mono text-2xs text-ink-ghost tabular-nums">{notes.filter(n => n.trashedAt).length}</span>
              )}
            </>
          )}
        </NavLink>
        <div className="relative">
          <button
            onClick={() => setSettingsOpen(open => !open)}
            className="ink-bleed w-full flex items-center gap-2.5 pl-4 pr-3 py-[7px] rounded text-[13px] text-ink-faint hover:text-ink transition-colors"
          >
            <Settings className="w-4 h-4 flex-shrink-0" strokeWidth={1.75} />
            <span className="flex-1 text-left truncate">Settings</span>
          </button>
          <SettingsPopover open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </div>

        {/* The ink well — how much page got wet today */}
        <div className="flex items-center gap-2.5 px-4 pt-3 pb-1">
          <InkWell level={inkedToday / 4} pulse={lastWrite} className="w-[26px] h-[30px] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-mono text-2xs text-ink-ghost leading-tight">today's ink</p>
            <p className="font-mono text-2xs text-ink-soft tabular-nums leading-tight">
              {inkedToday} {inkedToday === 1 ? 'page' : 'pages'} wet
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 px-4 pt-3 pb-1">
          <div className="w-7 h-7 rounded-full bg-ink text-paper flex items-center justify-center text-[11px] font-semibold flex-shrink-0 font-mono">
            W
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-ink truncate">Writer</p>
            <p className="text-2xs text-ink-ghost truncate">local-first, on this device</p>
          </div>
        </div>
      </div>

      {folderDialogOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/25 p-4"
          onMouseDown={event => { if (event.target === event.currentTarget) setFolderDialogOpen(false); }}
        >
          <form
            onSubmit={submitFolder}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sidenav-folder-dialog-title"
            className="w-full max-w-sm bg-paper border border-line rounded-md p-5 shadow-pop"
          >
            <h3 id="sidenav-folder-dialog-title" className="font-serif text-lg font-semibold text-ink mb-3">New folder</h3>
            <input
              autoFocus
              required
              value={folderName}
              onChange={event => setFolderName(event.target.value)}
              placeholder="Folder name"
              aria-label="Folder name"
              className="w-full rounded-sm border-line bg-paper px-3 py-2 text-sm text-ink focus:border-fountain focus:ring-0"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFolderDialogOpen(false)}
                className="rounded-sm px-3.5 py-1.5 text-[13px] font-medium text-ink-faint hover:bg-paper-dim transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-sm bg-ink px-3.5 py-1.5 text-[13px] font-medium text-paper hover:bg-ink-soft transition-colors"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </aside>
  );
};
