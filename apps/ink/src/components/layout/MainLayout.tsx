import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { Notebook, Sun, Tags, Crosshair, BarChart3, Undo2, MoreHorizontal, Star, History, Trash2, Settings, Spline } from 'lucide-react';
import { InkBlot } from '../../lib/ink';
import { SideNavBar } from '../Navigation/SideNavBar';
import { CommandPalette } from '../CommandPalette';
import { SettingsPopover } from '../SettingsPopover';
import { useStore } from '../../store';

const mobileItems = [
  { to: '/', icon: Notebook, label: 'Notes' },
  { to: '/today', icon: Sun, label: 'Today' },
  { to: '/tags', icon: Tags, label: 'Tags' },
  { to: '/focus', icon: Crosshair, label: 'Focus' },
  { to: '/insights', icon: BarChart3, label: 'Insights' },
];

const moreItems = [
  { to: '/favorites', icon: Star,    label: 'Favorites' },
  { to: '/recent',    icon: History, label: 'Recent' },
  { to: '/web',       icon: Spline,  label: 'Ink web' },
  { to: '/trash',     icon: Trash2,  label: 'Wastebasket' },
];

export const MainLayout: React.FC = () => {
  const [isPaletteOpen, setIsPaletteOpen] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const { notice, setNotice, restoreNote, notes } = useStore();
  const navigate = useNavigate();
  const trashCount = notes.filter(n => n.trashedAt).length;

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsPaletteOpen(open => !open);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  React.useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice, setNotice]);

  // The desk is only so big — when storage refuses a write, say so plainly.
  React.useEffect(() => {
    const warn = () => setNotice({ message: 'The desk is full — export a copy, then clear room.' });
    window.addEventListener('ink:storage-full', warn);
    return () => window.removeEventListener('ink:storage-full', warn);
  }, [setNotice]);

  return (
    <div className="flex h-screen w-full bg-desk text-ink overflow-hidden">
      <SideNavBar />
      <main className="flex-1 flex overflow-hidden min-w-0">
        <Outlet />
      </main>

      <CommandPalette isOpen={isPaletteOpen} onClose={() => setIsPaletteOpen(false)} />

      {/* Undo / notice toast */}
      <AnimatePresence>
        {notice && (
          <motion.div
            key={notice.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 md:left-6 md:translate-x-0 z-[90] flex items-center gap-3 bg-ink text-paper pl-4 pr-2 py-2 rounded-md shadow-pop"
          >
            <span className="text-sm">{notice.message}</span>
            {notice.noteId && (
              <button
                onClick={() => restoreNote(notice.noteId!)}
                className="flex items-center gap-1.5 text-sm font-medium text-pencil-wash hover:text-paper px-2 py-1 rounded transition-colors"
              >
                <Undo2 className="w-3.5 h-3.5" strokeWidth={2} />
                Undo
              </button>
            )}
            <button
              onClick={() => setNotice(null)}
              aria-label="Dismiss"
              className="text-paper/50 hover:text-paper px-2 py-1 text-lg leading-none"
            >
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile bar */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-stretch px-2 pt-1 pb-[max(env(safe-area-inset-bottom),0.25rem)] bg-paper border-t border-line">
        {mobileItems.map(item => {
          const Icon = item.icon;
          if (item.to === '/today') {
            return (
              <button
                key={item.to}
                onClick={() => { useStore.getState().ensureDailyNote(); navigate('/'); }}
                className="flex flex-col items-center justify-center gap-1 px-3 py-2 text-ink-faint active:text-ink"
              >
                <Icon className="w-5 h-5" strokeWidth={1.75} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          }
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => clsx(
                'relative flex flex-col items-center justify-center gap-1 px-2.5 py-2',
                isActive ? 'text-ink' : 'text-ink-faint'
              )}
            >
              {({ isActive }) => (
                <>
                  {isActive && <InkBlot seed={`tab:${item.to}`} size={7} satellites={0} color="var(--color-pencil)" opacity={0.95} className="absolute top-1 left-1/2 -translate-x-1/2" />}
                  <Icon className="w-5 h-5" strokeWidth={isActive ? 2 : 1.75} />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
        <button
          onClick={() => setMoreOpen(open => !open)}
          className={clsx(
            'flex flex-col items-center justify-center gap-1 px-2.5 py-2',
            moreOpen ? 'text-ink' : 'text-ink-faint'
          )}
          aria-label="More — favorites, recent, workspace, wastebasket, settings"
        >
          <MoreHorizontal className="w-5 h-5" strokeWidth={1.75} />
          <span className="text-[10px] font-medium">More</span>
        </button>
      </nav>

      {/* Mobile "More" sheet — the rest of the desk drawer */}
      <AnimatePresence>
        {moreOpen && (
          <>
            <div className="fixed inset-0 z-[55] md:hidden" onClick={() => setMoreOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="md:hidden fixed bottom-16 left-3 right-3 z-[56] bg-paper border border-line rounded-md shadow-pop overflow-hidden"
            >
              {moreItems.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/trash'}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) => clsx(
                    'flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors',
                    isActive ? 'text-ink font-medium bg-paper-dim' : 'text-ink-faint hover:text-ink hover:bg-paper-dim'
                  )}
                >
                  <item.icon className="w-4 h-4" strokeWidth={1.75} />
                  <span className="flex-1">{item.label}</span>
                  {item.to === '/trash' && trashCount > 0 && (
                    <span className="font-mono text-2xs text-ink-ghost tabular-nums">{trashCount}</span>
                  )}
                </NavLink>
              ))}
              <button
                onClick={() => { setMoreOpen(false); setSettingsOpen(true); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-ink-faint hover:text-ink hover:bg-paper-dim transition-colors border-t border-line"
              >
                <Settings className="w-4 h-4" strokeWidth={1.75} />
                <span className="flex-1 text-left">Settings</span>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Mobile settings — popover anchors above this fixed rail */}
      <div className="md:hidden fixed bottom-16 left-3 right-3 z-[60] h-0 pointer-events-none">
        <div className="relative h-0 pointer-events-auto">
          <SettingsPopover open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </div>
      </div>
    </div>
  );
};
