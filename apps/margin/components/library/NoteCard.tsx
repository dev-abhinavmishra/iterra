import React from 'react';
import { Note } from '../../types';
import { Card, Icon, IconBtn, Tag } from '../ui/primitives';
import { shortDate, showDuration } from '../../services/format';

export type CardLayout = 'grid' | 'list';

const TYPE_ICON: Record<Note['type'], string> = {
    AUDIO: 'graphic_eq',
    PDF: 'picture_as_pdf',
    IMAGE: 'image',
    TEXT: 'description',
    VIDEO: 'videocam',
};

const metaLine = (note: Note) =>
    [shortDate(note.date), (note.type || 'text').toLowerCase(), showDuration(note.duration)].filter(Boolean).join(' · ');

// First lines of body text as a preview, like a peek at the card's contents.
const snippetOf = (html: string): string =>
    (new DOMParser()
        .parseFromString(
            (html || '')
                .replace(/<\/(p|div|li|h[1-6]|blockquote|pre|tr|ul|ol)>/gi, '</$1> ')
                .replace(/<(p|div|ul|ol|h[1-6]|blockquote|pre|table)[\s>]/gi, ' <$1'),
            'text/html'
        )
        .body.textContent || '')
        .replace(/\s+/g, ' ')
        .trim();

// Card content often opens with a heading that repeats the note title —
// don't echo it in the preview.
const snippetFor = (note: Note): string => {
    const s = snippetOf(note.content || '');
    const t = (note.title || '').trim();
    if (t && s.toLowerCase().startsWith(t.toLowerCase())) {
        return s.slice(t.length).replace(/^[-–—:.,\s]+/, '').trim();
    }
    return s;
};

const CheckBox: React.FC<{ checked: boolean; visible: boolean }> = ({ checked, visible }) => (
    <span
        className={`w-4 h-4 rounded-[4px] border inline-flex items-center justify-center transition-opacity duration-100
            ${checked ? 'bg-[var(--mark)] border-transparent' : 'bg-[var(--card)] border-[var(--line-2)]'}
            ${visible || checked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
    >
        {checked && <Icon name="check" size={12} className="text-[var(--mark-ink)]" />}
    </span>
);

const SelectedVeil: React.FC = () => (
    <>
        <span className="absolute inset-0 bg-[var(--tape)] pointer-events-none" />
        <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-mark pointer-events-none" />
    </>
);

interface NoteCardProps {
    note: Note;
    layout: CardLayout;
    selected: boolean;
    selectionActive: boolean;
    compact?: boolean;
    onOpen: (note: Note) => void;
    onToggleSelect: (id: string) => void;
    onTogglePin: (note: Note) => void;
    onDelete: (note: Note) => void;
}

const NoteCard: React.FC<NoteCardProps> = ({
    note, layout, selected, selectionActive, compact,
    onOpen, onToggleSelect, onTogglePin, onDelete,
}) => {
    const stop = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); };
    const handleOpen = () => (selectionActive ? onToggleSelect(note.id) : onOpen(note));
    const snippet = snippetFor(note);

    if (layout === 'list') {
        return (
            <div
                onClick={handleOpen}
                className={`group relative flex items-center gap-3 px-4 h-12 cursor-pointer transition-colors duration-100
                    ${selected ? '' : 'hover:bg-[var(--card-2)]'}`}
            >
                {selected && <SelectedVeil />}
                <button
                    onClick={(e) => { stop(e); onToggleSelect(note.id); }}
                    aria-label={selected ? 'Deselect note' : 'Select note'}
                    className="relative z-10 shrink-0"
                >
                    <CheckBox checked={selected} visible={selectionActive} />
                </button>
                <Icon name={TYPE_ICON[note.type] || 'description'} size={16} className="relative z-10 text-ink-3 shrink-0" />
                <span className="relative z-10 font-serif text-[15px] text-ink truncate shrink-0 max-w-[40%]">
                    {note.title || 'Untitled'}
                </span>
                <span className="relative z-10 hidden md:block text-[12px] text-ink-3 truncate flex-1 min-w-0">
                    {snippet}
                </span>
                <span className="relative z-10 hidden lg:flex items-center gap-1 shrink-0">
                    {(note.tags || []).slice(0, 2).map(t => <Tag key={t}>{t}</Tag>)}
                </span>
                <span className="relative z-10 hidden sm:block font-mono text-[11px] text-ink-3 shrink-0 w-48 text-right truncate">
                    {metaLine(note)}
                </span>
                <span className="relative z-10 flex items-center shrink-0">
                    <IconBtn icon="keep" title={note.isBookmarked ? 'Unpin' : 'Pin'} active={note.isBookmarked}
                        className={note.isBookmarked ? '' : 'opacity-0 group-hover:opacity-100'}
                        onClick={(e) => { stop(e); onTogglePin(note); }} />
                    <span className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity duration-100">
                        <IconBtn icon="arrow_forward" title="Open" onClick={(e) => { stop(e); onOpen(note); }} />
                        <IconBtn icon="delete" title="Delete" danger onClick={(e) => { stop(e); onDelete(note); }} />
                    </span>
                </span>
            </div>
        );
    }

    return (
        <Card
            interactive
            onClick={handleOpen}
            className={`group relative flex flex-col overflow-visible ${compact ? 'min-h-[150px]' : 'min-h-[186px]'} ${note.isBookmarked ? 'tape' : ''}`}
        >
            {selected && <SelectedVeil />}

            <div className="flex items-start justify-between px-4 pt-3 relative z-10">
                <button
                    onClick={(e) => { stop(e); onToggleSelect(note.id); }}
                    aria-label={selected ? 'Deselect note' : 'Select note'}
                    className="-ml-1 p-0.5"
                >
                    <CheckBox checked={selected} visible={selectionActive} />
                </button>
                <IconBtn
                    icon="keep" title={note.isBookmarked ? 'Unpin' : 'Pin'} active={note.isBookmarked}
                    className={note.isBookmarked ? '' : 'opacity-0 group-hover:opacity-100'}
                    onClick={(e) => { stop(e); onTogglePin(note); }}
                />
            </div>

            <div className={`relative z-10 px-4 ${compact ? 'pt-1' : 'pt-2'} pb-2 flex-1 flex flex-col min-w-0 card-ruled`}>
                <h3 className={`font-serif text-ink leading-snug line-clamp-2 ${compact ? 'text-[15px]' : 'text-[17px]'}`}>
                    {note.title || 'Untitled'}
                </h3>
                {!compact && snippet && (
                    <p className="mt-1.5 text-[12px] text-ink-2 leading-relaxed line-clamp-3">
                        {snippet}
                    </p>
                )}
                {!compact && (note.tags || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2.5">
                        {note.tags.slice(0, 3).map(t => <Tag key={t}>{t}</Tag>)}
                        {note.tags.length > 3 && <Tag>+{note.tags.length - 3}</Tag>}
                    </div>
                )}
            </div>

            <div className="relative z-10 mt-auto border-t border-line rule-lines">
                <div className={`flex items-center justify-between gap-2 px-4 ${compact ? 'py-2' : 'py-2.5'} bg-[var(--card)]`}>
                    <span className="font-mono text-[11px] text-ink-3 truncate">{metaLine(note)}</span>
                    <span className="flex items-center shrink-0 -mr-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-100">
                        <IconBtn icon="arrow_forward" title="Open" size={16}
                            onClick={(e) => { stop(e); onOpen(note); }} />
                        <IconBtn icon="delete" title="Delete" danger size={16}
                            onClick={(e) => { stop(e); onDelete(note); }} />
                    </span>
                </div>
            </div>
        </Card>
    );
};

export default NoteCard;
