import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore, type Note, type SortOrder } from '../../store';
import { getNoteIndex, type NoteIndex } from '../../lib/notes';
import { useNow } from '../../lib/useNow';
import clsx from 'clsx';
import { formatDistanceToNow, format } from 'date-fns';
import { Search, Pin, Trash2, ArrowUpDown, Check, PenLine, Droplet } from 'lucide-react';
import { InkBlot, PenRest, ProofCircle } from '../../lib/ink';
import { penOf } from '../../lib/pens';

interface NoteListProps {
  filter?: 'pinned' | 'recent' | 'all';
  title?: string;
}

const SORT_OPTIONS: { id: SortOrder; label: string }[] = [
  { id: 'modified', label: 'Last edited' },
  { id: 'created', label: 'Date created' },
  { id: 'title', label: 'Title A–Z' },
  { id: 'words', label: 'Longest first' },
];

const sortNotes = (notes: Note[], order: SortOrder): Note[] => {
  const copy = [...notes];
  switch (order) {
    case 'created': return copy.sort((a, b) => b.createdAt - a.createdAt);
    case 'title': return copy.sort((a, b) => (a.title || 'Untitled').localeCompare(b.title || 'Untitled'));
    case 'words': return copy.sort((a, b) => b.wordCount - a.wordCount);
    default: return copy.sort((a, b) => b.lastModified - a.lastModified);
  }
};

const dateLabel = (time: number, now: number) =>
  now - time < 6 * 24 * 3600 * 1000
    ? formatDistanceToNow(time, { addSuffix: true })
    : format(time, 'MMM d');

const SIX_HOURS = 6 * 3600 * 1000;
const THIRTY_DAYS = 30 * 24 * 3600 * 1000;

export const NoteList: React.FC<NoteListProps> = ({ filter = 'all', title }) => {
  const {
    notes, activeNoteId, setActiveNote, searchQuery, setSearchQuery,
    togglePin, trashNote, addNote, activeFolder, setActiveFolder,
    folders, removeNoteTag, sortOrder, setSortOrder,
  } = useStore();
  const [sortOpen, setSortOpen] = useState(false);
  const now = useNow();
  // One flat-text pass over the library — search and snippets read the index.
  const index = useMemo(() => getNoteIndex(notes), [notes]);

  const live = notes.filter(n => !n.trashedAt);

  const query = searchQuery.trim().toLowerCase();
  const tagQuery = query.startsWith('#') ? query.slice(1) : null;

  let displayNotes = live.filter(note => {
    if (tagQuery !== null) {
      if (tagQuery && !note.tags.some(tag => tag.toLowerCase().includes(tagQuery))) return false;
    } else if (query) {
      const match =
        note.title.toLowerCase().includes(query) ||
        (index.get(note.id)?.lower.includes(query) ?? false) ||
        note.tags.some(tag => tag.toLowerCase().includes(query));
      if (!match) return false;
    }
    if (filter === 'pinned') return note.isPinned;
    if (filter === 'recent') return true;
    if (activeFolder === 'Untagged') return note.tags.length === 0;
    if (activeFolder !== 'All Notes') return note.folder === activeFolder;
    return true;
  });

  // Recent is the twenty most recently touched pages — picked before the
  // display sort so an old note edited today still surfaces here.
  if (filter === 'recent') {
    displayNotes = [...displayNotes].sort((a, b) => b.lastModified - a.lastModified).slice(0, 20);
  }

  const sorted = sortNotes(displayNotes, sortOrder);
  const visibleSorted = filter === 'all'
    ? [...sorted.filter(n => n.isPinned), ...sorted.filter(n => !n.isPinned)]
    : sorted;

  const pinnedNotes = visibleSorted.filter(n => n.isPinned);
  const unpinnedNotes = visibleSorted.filter(n => !n.isPinned);
  const visibleTags = Array.from(new Set(visibleSorted.flatMap(note => note.tags))).sort();

  const sectionTitle = title || (filter === 'pinned' ? 'Favorites' : filter === 'recent' ? 'Recent' : activeFolder);

  return (
    <section className="w-full md:w-[320px] lg:w-[352px] bg-desk-deep/40 flex flex-col flex-shrink-0 border-r border-line overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex-shrink-0 border-b border-line">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-ghost pointer-events-none" strokeWidth={1.75} />
          <input
            type="text"
            aria-label="Search notes by text or #tag"
            className="w-full pl-9 pr-8 py-2 bg-paper border border-line rounded text-[13px] text-ink placeholder:text-ink-ghost focus:ring-0 focus:border-line-strong transition-colors"
            placeholder="Search notes…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-2xs text-ink-ghost pointer-events-none hidden sm:block">⌘K</kbd>
        </div>

        {visibleTags.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2.5 scrollbar-none">
            {visibleTags.map(tag => (
              <button
                key={tag}
                onClick={() => setSearchQuery(`#${tag}`)}
                className="font-mono text-2xs text-fountain hover:text-pencil whitespace-nowrap transition-colors"
              >
                #{tag.toLowerCase()}
              </button>
            ))}
          </div>
        )}

        {filter === 'all' && (
          <div className="flex items-center gap-1 overflow-x-auto pb-2 scrollbar-none">
            {['All Notes', ...folders.map(f => f.name)].map(folderName => (
              <button
                key={folderName}
                onClick={() => setActiveFolder(folderName)}
                className={clsx(
                  'text-[11px] font-medium px-2.5 py-1 rounded whitespace-nowrap transition-colors flex-shrink-0',
                  activeFolder === folderName
                    ? 'bg-ink text-paper'
                    : 'text-ink-faint hover:text-ink hover:bg-paper-dim'
                )}
              >
                {folderName}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <h2 className="font-serif text-[17px] font-semibold text-ink">
            {sectionTitle}
            <span className="ml-2 font-mono text-2xs font-normal text-ink-ghost align-middle">{visibleSorted.length}</span>
          </h2>
          <div className="flex items-center gap-1">
            <div className="relative">
              <button
                onClick={() => setSortOpen(open => !open)}
                aria-label="Sort notes"
                title="Sort"
                className="w-7 h-7 flex items-center justify-center rounded text-ink-faint hover:text-ink hover:bg-paper-dim transition-colors"
              >
                <ArrowUpDown className="w-3.5 h-3.5" strokeWidth={1.75} />
              </button>
              <AnimatePresence>
                {sortOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.12 }}
                      className="absolute right-0 top-full mt-1 z-50 w-44 bg-paper border border-line rounded shadow-pop py-1"
                    >
                      {SORT_OPTIONS.map(option => (
                        <button
                          key={option.id}
                          onClick={() => { setSortOrder(option.id); setSortOpen(false); }}
                          className="w-full flex items-center justify-between px-3 py-1.5 text-left text-[13px] text-ink-soft hover:bg-paper-dim"
                        >
                          {option.label}
                          {sortOrder === option.id && <Check className="w-3.5 h-3.5 text-pencil" strokeWidth={2.5} />}
                        </button>
                      ))}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
            <button
              onClick={() => addNote()}
              aria-label="New note"
              title="New note"
              className="w-7 h-7 flex items-center justify-center rounded text-ink-faint hover:text-ink hover:bg-paper-dim transition-colors"
            >
              <PenLine className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto px-2.5 py-2 pb-20 md:pb-4 custom-scrollbar">
        {visibleSorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2.5 py-16 text-center px-6">
            {!searchQuery && <PenRest className="w-24 h-12 mb-1 opacity-80" />}
            <p className="font-serif text-[15px] text-ink-faint">
              {searchQuery ? 'Nothing matches that search.' : 'An empty drawer.'}
            </p>
            {!searchQuery && (
              <button onClick={() => addNote()} className="text-[13px] font-medium text-pencil hover:text-pencil-deep transition-colors">
                Write the first note
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-0.5">
            {pinnedNotes.length > 0 && filter !== 'pinned' && (
              <>
                <div className="px-2.5 pt-1 pb-1 text-[11px] font-medium text-ink-ghost flex items-center gap-1.5">
                  <Pin className="w-3 h-3 text-pencil" strokeWidth={2} />
                  Pinned
                </div>
                {pinnedNotes.map(note => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    now={now}
                    isActive={activeNoteId === note.id}
                    onSelect={() => setActiveNote(note.id)}
                    onPin={togglePin}
                    onTrash={trashNote}
                    onTagClick={tag => setSearchQuery(`#${tag}`)}
                    onTagRemove={removeNoteTag}
                    index={index}
                  />
                ))}
                {unpinnedNotes.length > 0 && (
                  <div className="px-2.5 pt-3 pb-1 text-[11px] font-medium text-ink-ghost">The rest</div>
                )}
              </>
            )}
            {(filter === 'pinned' ? pinnedNotes : unpinnedNotes).map(note => (
              <NoteCard
                key={note.id}
                note={note}
                now={now}
                isActive={activeNoteId === note.id}
                onSelect={() => setActiveNote(note.id)}
                onPin={togglePin}
                onTrash={trashNote}
                onTagClick={tag => setSearchQuery(`#${tag}`)}
                onTagRemove={removeNoteTag}
                index={index}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

interface NoteCardProps {
  note: Note;
  now: number;
  isActive: boolean;
  onSelect: () => void;
  onPin: (id: string) => void;
  onTrash: (id: string) => void;
  onTagClick: (tag: string) => void;
  onTagRemove: (id: string, tag: string) => void;
  index: Map<string, NoteIndex>;
}

const NoteCard: React.FC<NoteCardProps> = ({ note, now, isActive, onSelect, onPin, onTrash, onTagClick, onTagRemove, index }) => {
  const snippet = (index.get(note.id)?.text ?? '').slice(0, 140);
  const pen = penOf(note.ink);
  const wet = now - note.lastModified < SIX_HOURS;
  // A page untouched for a month yellows like paper left in the sun.
  const aged = now - note.lastModified > THIRTY_DAYS;
  return (
    <div
      onClick={onSelect}
      className={clsx(
        'group relative rounded cursor-pointer transition-colors duration-100 px-3 py-2.5',
        isActive
          ? 'dog-ear bg-paper shadow-[0_0_0_1px_var(--color-line),0_2px_8px_-2px_rgba(27,30,33,0.1)]'
          : aged ? 'bg-manila-wash/40 hover:bg-manila-wash/60' : 'hover:bg-paper-dim/70'
      )}
    >
      {isActive && <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] bg-pencil rounded-r-full" />}

      <div className="flex items-start justify-between gap-2">
        <h3 className="relative self-start font-serif font-semibold leading-snug text-[15px] text-ink truncate pr-1 flex-1">
          {note.title || 'Untitled'}
          {note.isPinned && (
            <ProofCircle
              seed={`pin:${note.id}`}
              stretch
              className="absolute -inset-x-1.5 -inset-y-0.5 w-[calc(100%+12px)] h-[calc(100%+4px)] pointer-events-none"
            />
          )}
        </h3>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100 transition-opacity flex-shrink-0 -mr-1">
          <button
            onClick={e => { e.stopPropagation(); onPin(note.id); }}
            className={clsx(
              'w-6 h-6 rounded flex items-center justify-center transition-colors',
              note.isPinned ? 'text-pencil' : 'text-ink-ghost hover:text-ink hover:bg-paper-edge'
            )}
            title={note.isPinned ? 'Unpin' : 'Pin'}
          >
            <Pin className="w-3.5 h-3.5" strokeWidth={note.isPinned ? 2.25 : 1.75} fill={note.isPinned ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onTrash(note.id); }}
            className="w-6 h-6 rounded flex items-center justify-center text-ink-ghost hover:text-pencil hover:bg-pencil-wash transition-colors"
            title="Move to trash"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <p className="font-serif text-[12.5px] text-ink-faint line-clamp-2 leading-relaxed mt-0.5">
        {snippet || <span className="text-ink-ghost not-italic">A blank page.</span>}
      </p>

      <div className="flex items-center justify-between gap-2 mt-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {note.tags.slice(0, 3).map(tag => (
            <span key={tag} className="group/tag inline-flex items-center font-mono text-2xs">
              <button
                type="button"
                onClick={event => { event.stopPropagation(); onTagClick(tag); }}
                className="text-fountain hover:text-pencil transition-colors"
              >
                #{tag.toLowerCase()}
              </button>
              <button
                type="button"
                onClick={event => { event.stopPropagation(); onTagRemove(note.id, tag); }}
                aria-label={`Remove ${tag} tag`}
                className="text-ink-ghost hover:text-pencil opacity-0 group-hover/tag:opacity-100 transition-opacity"
              >
                ×
              </button>
            </span>
          ))}
          {note.dailyKey && <span className="font-mono text-2xs text-manila">journal</span>}
        </div>
        <span className="font-mono text-2xs text-ink-ghost flex-shrink-0 tabular-nums flex items-center gap-1">
          {now - note.lastModified < SIX_HOURS && (
            <Droplet className="w-2.5 h-2.5 text-fountain" strokeWidth={2.5} aria-label="Still wet" />
          )}
          {dateLabel(note.lastModified, now)}
        </span>
      </div>

      {/* every page carries its own blot — seeded by id, in its own pen.
          still-blue while the ink's wet, pen color once it dries. */}
      <InkBlot
        seed={note.id}
        size={15}
        satellites={1}
        color={wet ? 'var(--color-fountain)' : pen.color}
        opacity={wet ? 0.55 : 0.4}
        className={clsx(
          'absolute right-2.5 bottom-9 pointer-events-none transition-opacity',
          wet ? 'wet-blot opacity-60 group-hover:opacity-90' : 'opacity-50 group-hover:opacity-90'
        )}
      />
    </div>
  );
};
