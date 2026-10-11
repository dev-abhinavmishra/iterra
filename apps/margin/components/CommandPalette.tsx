import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Note, View } from '../types';
import { searchNotes } from '../services/searchService';
import { shortDate } from '../services/format';
import { Icon, Kbd } from './ui/primitives';

interface CommandPaletteProps {
    open: boolean;
    onClose: () => void;
    notes: Note[];
    onOpenNote: (note: Note) => void;
    onNavigate: (view: View) => void;
    onNewNote: () => void;
}

interface ActionItem {
    kind: 'action';
    id: string;
    icon: string;
    label: string;
    run: () => void;
}

interface NoteItem {
    kind: 'note';
    id: string;
    note: Note;
}

type Item = ActionItem | NoteItem;

const TYPE_ICONS: Record<Note['type'], string> = {
    AUDIO: 'mic',
    PDF: 'picture_as_pdf',
    IMAGE: 'image',
    TEXT: 'description',
    VIDEO: 'videocam',
};

const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, notes, onOpenNote, onNavigate, onNewNote }) => {
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Reset state every time the palette opens.
    useEffect(() => {
        if (open) {
            setQuery('');
            setActive(0);
            const t = setTimeout(() => inputRef.current?.focus(), 30);
            return () => clearTimeout(t);
        }
    }, [open]);

    const actions: ActionItem[] = useMemo(() => ([
        { kind: 'action', id: 'new', icon: 'edit_note', label: 'New note', run: onNewNote },
        { kind: 'action', id: 'record', icon: 'mic', label: 'Record', run: () => onNavigate(View.RECORDER) },
        { kind: 'action', id: 'notes', icon: 'note_stack', label: 'Go to Notes', run: () => onNavigate(View.LIBRARY) },
        { kind: 'action', id: 'ask', icon: 'forum', label: 'Go to Ask', run: () => onNavigate(View.ANALYSIS) },
        { kind: 'action', id: 'study', icon: 'style', label: 'Go to Study', run: () => onNavigate(View.STUDY) },
        { kind: 'action', id: 'pinned', icon: 'keep', label: 'Go to Pinned', run: () => onNavigate(View.BOOKMARKS) },
        { kind: 'action', id: 'recent', icon: 'history', label: 'Go to Recently viewed', run: () => onNavigate(View.HISTORY) },
        { kind: 'action', id: 'settings', icon: 'settings', label: 'Go to Settings', run: () => onNavigate(View.SETTINGS) },
    ]), [onNewNote, onNavigate]);

    const { visibleActions, visibleNotes } = useMemo(() => {
        const q = query.trim().toLowerCase();
        const acts = q ? actions.filter(a => a.label.toLowerCase().includes(q)) : actions;
        const found = q ? searchNotes(notes, query).slice(0, 8) : notes.slice(0, 6);
        return { visibleActions: acts, visibleNotes: found };
    }, [query, actions, notes]);

    const items: Item[] = useMemo(() => ([
        ...visibleActions,
        ...visibleNotes.map<Item>(n => ({ kind: 'note', id: `note-${n.id}`, note: n })),
    ]), [visibleActions, visibleNotes]);

    // Keep selection in range as the list shrinks/grows.
    useEffect(() => {
        setActive(i => Math.min(i, Math.max(0, items.length - 1)));
    }, [items.length]);

    const runItem = (item: Item) => {
        if (item.kind === 'action') item.run();
        else onOpenNote(item.note);
        onClose();
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive(i => Math.min(i + 1, items.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive(i => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (items[active]) runItem(items[active]);
        }
    };

    // Scroll the active row into view while arrowing.
    useEffect(() => {
        listRef.current
            ?.querySelector(`[data-idx="${active}"]`)
            ?.scrollIntoView({ block: 'nearest' });
    }, [active]);

    let rowIdx = -1;
    const rowClass = (i: number) =>
        `relative w-full flex items-center gap-2.5 px-3.5 h-10 text-left transition-colors duration-100
         ${i === active ? 'bg-[var(--mark-soft)]' : 'hover:bg-[var(--card-2)]'}`;

    const edge = (i: number) =>
        i === active ? <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-[var(--mark)]" /> : null;

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    className="fixed inset-0 z-[95] bg-black/45 flex justify-center items-start pt-[12vh] px-4"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.99 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.995 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        className="w-full max-w-lg bg-card border border-line-2 rounded-[var(--r-lg)] shadow-pop overflow-hidden"
                        role="dialog"
                        aria-label="Command palette"
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
                    >
                        {/* Input */}
                        <div className="flex items-center gap-2.5 h-12 px-3.5 border-b border-line">
                            <Icon name="search" size={18} className="text-ink-3" />
                            <input
                                ref={inputRef}
                                value={query}
                                onChange={e => { setQuery(e.target.value); setActive(0); }}
                                onKeyDown={onKeyDown}
                                placeholder="Search notes and commands…"
                                aria-label="Search notes and commands"
                                className="flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-ink-3 font-sans"
                            />
                            <Kbd>esc</Kbd>
                        </div>

                        {/* Results */}
                        <div ref={listRef} className="max-h-[320px] overflow-y-auto custom-scrollbar py-1.5">
                            {visibleActions.length > 0 && (
                                <>
                                    <div className="px-3.5 pt-1.5 pb-1 font-mono text-[10px] text-ink-3">actions</div>
                                    {visibleActions.map(a => {
                                        rowIdx += 1;
                                        const i = rowIdx;
                                        return (
                                            <button
                                                key={a.id}
                                                data-idx={i}
                                                onMouseEnter={() => setActive(i)}
                                                onClick={() => runItem(a)}
                                                className={rowClass(i)}
                                            >
                                                {edge(i)}
                                                <Icon name={a.icon} size={17} className={i === active ? 'text-mark' : 'text-ink-3'} />
                                                <span className="text-sm font-sans text-ink">{a.label}</span>
                                            </button>
                                        );
                                    })}
                                </>
                            )}

                            {visibleNotes.length > 0 && (
                                <>
                                    <div className="px-3.5 pt-2 pb-1 font-mono text-[10px] text-ink-3">
                                        {query.trim() ? 'notes' : 'recent notes'}
                                    </div>
                                    {visibleNotes.map(n => {
                                        rowIdx += 1;
                                        const i = rowIdx;
                                        return (
                                            <button
                                                key={n.id}
                                                data-idx={i}
                                                onMouseEnter={() => setActive(i)}
                                                onClick={() => runItem({ kind: 'note', id: `note-${n.id}`, note: n })}
                                                className={rowClass(i)}
                                            >
                                                {edge(i)}
                                                <Icon
                                                    name={TYPE_ICONS[n.type] || 'description'}
                                                    size={17}
                                                    className={i === active ? 'text-mark' : 'text-ink-3'}
                                                />
                                                <span className="font-serif text-[15px] text-ink truncate">
                                                    {n.title || 'Untitled'}
                                                </span>
                                                <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-3">
                                                    {(n.type || 'text').toLowerCase()} · {shortDate(n.date)}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </>
                            )}

                            {items.length === 0 && (
                                <div className="px-3.5 py-8 text-center">
                                    <p className="text-sm text-ink-3">Nothing matches “{query.trim()}”.</p>
                                </div>
                            )}
                        </div>

                        {/* Footer hints */}
                        <div className="flex items-center gap-3 px-3.5 py-2 border-t border-line">
                            <span className="flex items-center gap-1 font-mono text-[10px] text-ink-3"><Kbd>↑↓</Kbd> move</span>
                            <span className="flex items-center gap-1 font-mono text-[10px] text-ink-3"><Kbd>↵</Kbd> open</span>
                            <span className="flex items-center gap-1 font-mono text-[10px] text-ink-3"><Kbd>esc</Kbd> close</span>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default CommandPalette;
