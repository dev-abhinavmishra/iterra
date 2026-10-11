import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Search, FilePlus2, Sun, BookOpen, Users, BookMarked, Lightbulb, Trash2,
  Notebook, Star, History, Tags, Crosshair, BarChart3, FolderPlus,
  Download, Droplet, CornerDownLeft, Folder, Spline, BookText,
} from 'lucide-react';
import clsx from 'clsx';
import { useStore, type Note } from '../store';
import { NOTE_TEMPLATES } from '../lib/templates';
import { downloadFile, getNoteIndex, libraryToMarkdown } from '../lib/notes';
import { InkBlot } from '../lib/ink';
import { penOf } from '../lib/pens';

interface PaletteItem {
  id: string;
  icon?: React.ElementType;
  label: string;
  hint?: string;
  section: 'actions' | 'go' | 'notes';
  /** a page's fingerprint — drawn instead of an icon when present */
  blot?: { seed: string; color: string };
  run: () => void;
}

export const CommandPalette: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { notes, folders, prefs, setPrefs, setActiveNote, ensureDailyNote, addNote, addFolder } = useStore();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'search' | 'folder'>('search');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setMode('search');
      setIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  const go = (path: string) => {
    navigate(path);
    onClose();
  };

  const openNote = (note: Note) => {
    setActiveNote(note.id);
    navigate('/');
    onClose();
  };

  // Flat text, parsed once per library change — search taps it instead of
  // re-walking every note's document on every keystroke.
  const textIndex = useMemo(() => getNoteIndex(notes), [notes]);

  const items = useMemo<PaletteItem[]>(() => {
    const live = notes.filter(n => !n.trashedAt);
    const trashed = notes.filter(n => n.trashedAt);
    const q = query.trim().toLowerCase();

    const actions: PaletteItem[] = [
      { id: 'new', icon: FilePlus2, label: 'New blank page', hint: 'dip the pen', section: 'actions',
        run: () => { addNote(); go('/'); } },
      { id: 'today', icon: Sun, label: "Today's journal", hint: 'daily note', section: 'actions',
        run: () => { ensureDailyNote(); go('/'); } },
      ...NOTE_TEMPLATES.filter(t => t.id !== 'blank').map(t => ({
        id: `tpl-${t.id}`, icon: t.id === 'journal' ? BookOpen : t.id === 'meeting' ? Users : t.id === 'reading' ? BookMarked : Lightbulb,
        label: `New · ${t.name}`, hint: t.hint, section: 'actions' as const,
        run: () => { addNote(t.build()); go('/'); },
      })),
      { id: 'folder', icon: FolderPlus, label: 'New folder…', hint: 'name it here', section: 'actions',
        run: () => setMode('folder') },
      { id: 'wetink', icon: Droplet, label: `${prefs.wetInk ? 'Dry' : 'Wet'} ink`, hint: 'words land wet on the page', section: 'actions',
        run: () => { setPrefs({ wetInk: !prefs.wetInk }); onClose(); } },
      { id: 'bind', icon: BookText, label: 'Bind the library', hint: 'one markdown volume', section: 'actions',
        run: () => { downloadFile('ink-library.md', libraryToMarkdown(live)); onClose(); } },
      { id: 'export', icon: Download, label: 'Export library as JSON', hint: `${live.length} notes`, section: 'actions',
        run: () => { downloadFile('ink-library.json', JSON.stringify(live, null, 2), 'application/json'); onClose(); } },
      { id: 'trash', icon: Trash2, label: 'Open the wastebasket', hint: `${trashed.length} note${trashed.length === 1 ? '' : 's'}`, section: 'actions',
        run: () => go('/trash') },
    ];

    const goTo: PaletteItem[] = [
      { id: 'go-notes', icon: Notebook, label: 'All Notes', hint: `${live.length}`, section: 'go', run: () => go('/') },
      { id: 'go-fav', icon: Star, label: 'Favorites', hint: `${live.filter(n => n.isPinned).length}`, section: 'go', run: () => go('/favorites') },
      { id: 'go-recent', icon: History, label: 'Recent', section: 'go', run: () => go('/recent') },
      { id: 'go-tags', icon: Tags, label: 'Tags & folders', section: 'go', run: () => go('/tags') },
      { id: 'go-focus', icon: Crosshair, label: 'Deep work', hint: 'focus mode', section: 'go', run: () => go('/focus') },
      { id: 'go-web', icon: Spline, label: 'The ink web', hint: 'how pages link', section: 'go', run: () => go('/web') },
      { id: 'go-insights', icon: BarChart3, label: 'Insights', section: 'go', run: () => go('/insights') },
    ];

    const noteItems: PaletteItem[] = (q
      ? live.filter(n => {
          const haystack = `${n.title.toLowerCase()} ${n.tags.join(' ').toLowerCase()} ${textIndex.get(n.id)?.lower ?? ''}`;
          return q.startsWith('#')
            ? n.tags.some(t => t.toLowerCase().includes(q.slice(1)))
            : haystack.includes(q);
        })
      : [...live].sort((a, b) => b.lastModified - a.lastModified).slice(0, 5)
    ).map(note => ({
      id: `note-${note.id}`,
      icon: note.dailyKey ? Sun : note.isPinned ? Star : undefined,
      blot: note.dailyKey || note.isPinned ? undefined : { seed: note.id, color: penOf(note.ink).color },
      label: note.title || 'Untitled',
      hint: note.folder,
      section: 'notes' as const,
      run: () => openNote(note),
    }));

    const match = (item: PaletteItem) => item.label.toLowerCase().includes(q);
    return [
      ...actions.filter(a => !q || match(a)),
      ...goTo.filter(g => q && match(g)),
      ...noteItems,
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, notes, prefs.wetInk, textIndex]);

  useEffect(() => setIndex(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (mode === 'folder') { setMode('search'); return; }
      onClose();
      return;
    }
    if (mode === 'folder') {
      if (e.key === 'Enter') {
        const name = query.trim();
        if (name && !folders.some(f => f.name.toLowerCase() === name.toLowerCase())) {
          addFolder(name);
          useStore.getState().setActiveFolder(name);
        }
        onClose();
      }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => Math.min(i + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[index];
      if (item) item.run();
      else if (query.trim()) { addNote({ title: query.trim() }); go('/'); }
    }
  };

  let lastSection = '';

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4" onKeyDown={handleKeyDown}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="absolute inset-0 bg-ink/25"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={{ opacity: 0, y: -10, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-xl bg-paper border border-line rounded-md shadow-pop overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 border-b border-line">
              <Search className="w-4 h-4 text-ink-ghost flex-shrink-0" strokeWidth={1.75} />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={mode === 'folder' ? 'Name the folder, then Enter…' : 'Search notes, or do something…'}
                aria-label={mode === 'folder' ? 'New folder name' : 'Search notes and commands'}
                className="w-full py-3.5 bg-transparent border-0 p-0 text-[15px] text-ink placeholder:text-ink-ghost focus:ring-0"
              />
              <span className="kbd flex-shrink-0">esc</span>
            </div>

            <div ref={listRef} className="max-h-[46vh] overflow-y-auto py-1.5 custom-scrollbar">
              {mode === 'folder' ? (
                <div className="px-4 py-6 flex items-center gap-3 text-sm text-ink-faint">
                  <Folder className="w-4 h-4 text-manila" strokeWidth={1.75} />
                  Type a name and press Enter. Esc goes back.
                </div>
              ) : items.length === 0 ? (
                <button
                  onClick={() => { addNote({ title: query.trim() }); go('/'); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left text-sm text-ink hover:bg-paper-dim"
                >
                  <FilePlus2 className="w-4 h-4 text-pencil" strokeWidth={1.75} />
                  New note “{query.trim()}”
                </button>
              ) : (
                items.map((item, i) => {
                  const sectionLabel = item.section === 'actions' ? 'Do' : item.section === 'go' ? 'Go to' : 'Notes';
                  const header = item.section !== lastSection ? (lastSection = item.section, sectionLabel) : null;
                  const Icon = item.icon;
                  return (
                    <React.Fragment key={item.id}>
                      {header && (
                        <div className="px-4 pt-3 pb-1 text-[11px] font-medium text-ink-ghost select-none">{header}</div>
                      )}
                      <button
                        data-index={i}
                        onMouseEnter={() => setIndex(i)}
                        onClick={item.run}
                        className={clsx(
                          'relative w-full flex items-center gap-3 pl-5 pr-4 py-2 text-left text-sm transition-colors',
                          i === index ? 'bg-paper-dim text-ink' : 'text-ink-soft'
                        )}
                      >
                        {i === index && <span className="margin-mark" style={{ left: 6 }} />}
                        {item.blot
                          ? <InkBlot seed={item.blot.seed} size={14} satellites={0} color={item.blot.color} opacity={0.7} className="flex-shrink-0" />
                          : Icon && <Icon className={clsx('w-4 h-4 flex-shrink-0', i === index ? 'text-ink' : 'text-ink-ghost')} strokeWidth={1.75} />}
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.hint && <span className="font-mono text-2xs text-ink-ghost flex-shrink-0">{item.hint}</span>}
                      </button>
                    </React.Fragment>
                  );
                })
              )}
            </div>

            <div className="flex items-center gap-4 px-4 py-2.5 border-t border-line text-2xs text-ink-ghost">
              <span className="flex items-center gap-1.5"><span className="kbd">↑↓</span> move</span>
              <span className="flex items-center gap-1.5"><CornerDownLeft className="w-3 h-3" /> open</span>
              <span className="flex items-center gap-1.5"><span className="kbd">#</span> filter by tag</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
