import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Note, View } from '../types';
import { getAllNotes, saveNote } from '../services/storageService';
import { searchNotes } from '../services/searchService';
import { exportNoteMarkdown } from '../services/exportService';
import { Btn, Card, Divider, EmptyState, Modal } from '../components/ui/primitives';
import NoteCard, { CardLayout } from '../components/library/NoteCard';
import LibraryToolbar, { SortKey, TypeFilter } from '../components/library/LibraryToolbar';
import BulkBar from '../components/library/BulkBar';
import ImportOverlay, { IMPORT_ACCEPT, useNoteImport } from '../components/library/ImportOverlay';

interface LibraryViewProps {
    notes: Note[];
    onOpenNote: (note: Note) => void;
    onNavigate: (view: View) => void;
    onNewNote: () => void;
    onImport: (note: Note) => void;
    onDeleteNote: (noteId: string) => void;
    onUpdateNote?: (note: Note) => void;
    filterView?: View;
    compactMode?: boolean;
}

const newNoteId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const dateKey = (n: Note): number => {
    const t = Date.parse(n.date);
    return Number.isNaN(t) ? 0 : t;
};
const idKey = (n: Note): number => {
    const v = Number(n.id);
    return Number.isNaN(v) ? 0 : v;
};
const accessedKey = (n: Note): number => (n.lastAccessed ? Date.parse(n.lastAccessed) : 0);

const SORTERS: Record<SortKey, (a: Note, b: Note) => number> = {
    recent: (a, b) => (dateKey(b) - dateKey(a)) || (idKey(b) - idKey(a)),
    oldest: (a, b) => (dateKey(a) - dateKey(b)) || (idKey(a) - idKey(b)),
    title: (a, b) => (a.title || 'Untitled').localeCompare(b.title || 'Untitled'),
};

const LibraryView: React.FC<LibraryViewProps> = ({
    notes = [], onOpenNote, onNavigate, onNewNote, onImport, onDeleteNote, onUpdateNote, filterView, compactMode = false,
}) => {
    const canImport = !filterView;

    const [query, setQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
    const [tagFilter, setTagFilter] = useState('');
    const [sort, setSort] = useState<SortKey>('recent');
    const [layout, setLayout] = useState<CardLayout>('grid');
    const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
    const [deleteTargets, setDeleteTargets] = useState<Note[] | null>(null);
    const [overrides, setOverrides] = useState<Record<string, Partial<Note>>>({});
    const [dragging, setDragging] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const dragDepth = useRef(0);
    const importer = useNoteImport(onImport);

    /* App's notes[] stays the source of truth: patchNote routes through
       onUpdateNote (handleSaveNote) so a pin can't be clobbered by a stale
       copy later. The overrides/IDB merge stays as a fast local fallback for
       contexts that don't pass the prop. */
    const [idbPins, setIdbPins] = useState<Map<string, boolean> | null>(null);
    useEffect(() => {
        let live = true;
        getAllNotes()
            .then(all => { if (live) setIdbPins(new Map(all.map(n => [n.id, !!n.isBookmarked]))); })
            .catch(() => {});
        return () => { live = false; };
    }, [notes]);

    const patchedNotes = useMemo(
        () => notes.map(n => {
            const isBookmarked = overrides[n.id]?.isBookmarked ?? idbPins?.get(n.id) ?? n.isBookmarked;
            return { ...n, ...overrides[n.id], isBookmarked };
        }),
        [notes, overrides, idbPins],
    );

    const patchNote = useCallback((note: Note, patch: Partial<Note>) => {
        const updated = { ...note, ...patch };
        setOverrides(prev => ({ ...prev, [note.id]: { ...prev[note.id], ...patch } }));
        if (onUpdateNote) onUpdateNote(updated);
        else saveNote(updated).catch(err => console.error('Failed to update note:', err));
    }, [onUpdateNote]);

    const togglePin = useCallback((note: Note) => {
        patchNote(note, { isBookmarked: !note.isBookmarked });
    }, [patchNote]);

    /* ---- filtering ---- */
    const visibleNotes = useMemo(() => {
        let result: Note[] = patchedNotes;
        if (filterView === View.BOOKMARKS) result = result.filter(n => n.isBookmarked);
        if (query.trim()) result = searchNotes(result, query);
        if (typeFilter !== 'ALL') result = result.filter(n => n.type === typeFilter);
        if (tagFilter) result = result.filter(n => (n.tags || []).includes(tagFilter));

        if (filterView === View.HISTORY && sort === 'recent') {
            return [...result].sort((a, b) => accessedKey(b) - accessedKey(a));
        }
        return [...result].sort(SORTERS[sort]);
    }, [patchedNotes, filterView, query, typeFilter, tagFilter, sort]);

    const pinned = useMemo(
        () => (filterView ? [] : visibleNotes.filter(n => n.isBookmarked)),
        [visibleNotes, filterView],
    );
    const unpinned = useMemo(
        () => (filterView ? visibleNotes : visibleNotes.filter(n => !n.isBookmarked)),
        [visibleNotes, filterView],
    );

    const allTags = useMemo(() => {
        const tags = new Set<string>();
        patchedNotes.forEach(n => (n.tags || []).forEach(t => tags.add(t)));
        return Array.from(tags).sort((a, b) => a.localeCompare(b));
    }, [patchedNotes]);

    /* ---- selection ---- */
    const selectionActive = selected.size > 0;
    const selectedNotes = useMemo(
        () => patchedNotes.filter(n => selected.has(n.id)),
        [patchedNotes, selected],
    );
    const allSelectedPinned = selectedNotes.length > 0 && selectedNotes.every(n => n.isBookmarked);

    const toggleSelect = useCallback((id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);

    // Prune selections for notes that disappeared; Esc clears the selection.
    useEffect(() => {
        setSelected(prev => {
            const live = new Set(patchedNotes.map(n => n.id));
            const next = new Set([...prev].filter(id => live.has(id)));
            return next.size === prev.size ? prev : next;
        });
    }, [patchedNotes]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setSelected(new Set());
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    /* ---- bulk actions ---- */
    const bulkPin = useCallback(() => {
        const next = !allSelectedPinned;
        selectedNotes.forEach(n => patchNote(n, { isBookmarked: next }));
    }, [allSelectedPinned, selectedNotes, patchNote]);

    const bulkExport = useCallback(() => {
        selectedNotes.forEach(exportNoteMarkdown);
    }, [selectedNotes]);

    const confirmDelete = useCallback(() => {
        (deleteTargets || []).forEach(n => onDeleteNote(n.id));
        setDeleteTargets(null);
        setSelected(new Set());
    }, [deleteTargets, onDeleteNote]);

    /* ---- create / navigate ---- */
    const handleNewNote = useCallback(() => {
        onNewNote();
    }, [onNewNote]);

    /* ---- drag & drop ---- */
    const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files');
    const onDragEnter = (e: React.DragEvent) => {
        if (!canImport || !hasFiles(e)) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
    };
    const onDragOver = (e: React.DragEvent) => {
        if (!canImport || !hasFiles(e)) return;
        e.preventDefault();
    };
    const onDragLeave = (e: React.DragEvent) => {
        if (!canImport || !hasFiles(e)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
    };
    const onDrop = (e: React.DragEvent) => {
        if (!canImport || !hasFiles(e)) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        importer.start(Array.from(e.dataTransfer.files));
    };

    /* ---- presentation ---- */
    const pageTitle =
        filterView === View.BOOKMARKS ? 'Pinned'
            : filterView === View.HISTORY ? 'Recently viewed'
                : 'Notes';

    const filtersActive = Boolean(query.trim()) || typeFilter !== 'ALL' || Boolean(tagFilter);
    const clearFilters = () => { setQuery(''); setTypeFilter('ALL'); setTagFilter(''); };

    const cardProps = {
        layout, compact: compactMode, selectionActive,
        onOpen: onOpenNote, onToggleSelect: toggleSelect, onTogglePin: togglePin,
        onDelete: (note: Note) => setDeleteTargets([note]),
    };

    const renderCards = (list: Note[]) =>
        layout === 'grid' ? (
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${compactMode ? 'lg:grid-cols-4 xl:grid-cols-5 gap-3' : 'lg:grid-cols-3 xl:grid-cols-4 gap-4'}`}>
                {list.map(note => (
                    <NoteCard key={note.id} note={note} selected={selected.has(note.id)} {...cardProps} />
                ))}
            </div>
        ) : (
            <Card className="overflow-hidden">
                {list.map((note, i) => (
                    <div key={note.id} className={i > 0 ? 'border-t border-line' : ''}>
                        <NoteCard note={note} selected={selected.has(note.id)} {...cardProps} />
                    </div>
                ))}
            </Card>
        );

    const emptyState = () => {
        if (filtersActive) {
            return (
                <EmptyState
                    icon="search_off"
                    title="Nothing matches"
                    body="No notes match this search or filter set."
                    action={<Btn variant="quiet" onClick={clearFilters}>Clear filters</Btn>}
                />
            );
        }
        if (filterView === View.BOOKMARKS) {
            return (
                <EmptyState
                    icon="keep"
                    title="Nothing pinned"
                    body="Pin a note and it stays at the top of your index."
                />
            );
        }
        if (filterView === View.HISTORY) {
            return (
                <EmptyState
                    icon="history"
                    title="No recently viewed notes"
                    body="Open a note and it shows up here."
                />
            );
        }
        return (
            <EmptyState
                icon="note_stack"
                title="No notes yet"
                body="Record a lecture, drop a file to import, or start a blank note — everything lands here as a card."
                action={
                    <div className="flex items-center gap-2">
                        <Btn variant="primary" icon="mic" onClick={() => onNavigate(View.RECORDER)}>Record a lecture</Btn>
                        <Btn variant="quiet" icon="upload_file" onClick={() => fileInputRef.current?.click()}>Import a file</Btn>
                    </div>
                }
            />
        );
    };

    return (
        <main
            className="flex-1 flex flex-col min-w-0 relative overflow-hidden bg-paper"
            onDragEnter={onDragEnter}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
        >
            <header className="shrink-0 h-14 border-b border-line flex items-baseline px-5 md:px-8 pt-4 gap-3">
                <h1 key={pageTitle} className="font-serif text-[20px] text-ink leading-none ink-write ink-underline">{pageTitle}</h1>
                <span className="font-mono text-[11px] text-ink-3">
                    {visibleNotes.length} {visibleNotes.length === 1 ? 'note' : 'notes'}
                </span>
                <nav className="ml-auto flex items-center gap-1" aria-label="Library views">
                    {([
                        { view: View.LIBRARY, label: 'All notes' },
                        { view: View.BOOKMARKS, label: 'Pinned' },
                        { view: View.HISTORY, label: 'Recent' },
                    ] as const).map(v => (
                        <button
                            key={v.view}
                            onClick={() => onNavigate(v.view)}
                            className={`font-mono text-[11px] px-2 py-1 rounded-[var(--r)] transition-colors duration-100
                                ${(v.view === View.LIBRARY ? !filterView : filterView === v.view) ? 'text-mark bg-[var(--mark-soft)]' : 'text-ink-3 hover:text-ink hover:bg-[var(--card-2)]'}`}
                        >
                            {v.label}
                        </button>
                    ))}
                </nav>
            </header>

            <div className="shrink-0 border-b border-line px-5 md:px-8 py-2.5">
                <LibraryToolbar
                    query={query} onQueryChange={setQuery}
                    typeFilter={typeFilter} onTypeFilter={setTypeFilter}
                    tagFilter={tagFilter} onTagFilter={setTagFilter} allTags={allTags}
                    sort={sort} onSort={setSort}
                    layout={layout} onLayout={setLayout}
                    canImport={canImport}
                    onImportClick={() => fileInputRef.current?.click()}
                    onNewNote={handleNewNote}
                    onRecord={() => onNavigate(View.RECORDER)}
                />
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar page-lines pl-5 pr-5 md:pr-8 lg:pl-[76px] py-6">
                {visibleNotes.length === 0 ? (
                    emptyState()
                ) : (
                    <div className="flex flex-col gap-7">
                        {pinned.length > 0 && (
                            <section>
                                <div className="flex items-center gap-3 mb-3">
                                    <span className="font-hand text-[17px] text-ink-3 flex items-center gap-1.5">
                                        Pinned
                                    </span>
                                    <Divider className="flex-1" />
                                </div>
                                {renderCards(pinned)}
                            </section>
                        )}
                        {unpinned.length > 0 && (
                            <section>
                                {pinned.length > 0 && (
                                    <div className="flex items-center gap-3 mb-3">
                                        <span className="font-hand text-[17px] text-ink-3">All notes</span>
                                        <Divider className="flex-1" />
                                    </div>
                                )}
                                {renderCards(unpinned)}
                            </section>
                        )}
                    </div>
                )}
            </div>

            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={IMPORT_ACCEPT}
                className="hidden"
                onChange={(e) => {
                    importer.start(Array.from(e.target.files || []));
                    e.target.value = '';
                }}
            />

            <ImportOverlay
                items={importer.items}
                finished={importer.finished}
                dragging={dragging}
                onDismiss={importer.dismiss}
            />

            <BulkBar
                count={selectedNotes.length}
                allPinned={allSelectedPinned}
                onPin={bulkPin}
                onExport={bulkExport}
                onDelete={() => setDeleteTargets(selectedNotes)}
                onClear={() => setSelected(new Set())}
            />

            <Modal open={!!deleteTargets} onClose={() => setDeleteTargets(null)}>
                <div className="p-5">
                    <h3 className="font-serif text-lg text-ink">
                        Delete {deleteTargets && deleteTargets.length > 1 ? `${deleteTargets.length} notes` : 'this note'}?
                    </h3>
                    <p className="text-sm text-ink-2 mt-1.5">
                        {deleteTargets && deleteTargets.length > 1
                            ? 'They will be removed from your library permanently.'
                            : `"${deleteTargets?.[0]?.title || 'Untitled'}" will be removed permanently.`}
                    </p>
                    <div className="flex justify-end gap-2 mt-5">
                        <Btn variant="ghost" onClick={() => setDeleteTargets(null)}>Cancel</Btn>
                        <Btn variant="danger" onClick={confirmDelete}>
                            Delete {deleteTargets && deleteTargets.length > 1 ? deleteTargets.length : ''}
                        </Btn>
                    </div>
                </div>
            </Modal>
        </main>
    );
};

export default LibraryView;
