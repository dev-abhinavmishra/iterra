import React, { useMemo } from 'react';
import { Note } from '../../types';
import { relatedNotes } from '../../services/searchService';
import { Divider, Icon } from '../ui/primitives';

interface RelatedNotesProps {
    note: Note;
    notes: Note[];
    onOpenNote: (note: Note) => void;
}

const TYPE_ICON: Record<Note['type'], string> = {
    AUDIO: 'mic',
    PDF: 'picture_as_pdf',
    IMAGE: 'image',
    VIDEO: 'videocam',
    TEXT: 'notes',
};

const RelatedNotes: React.FC<RelatedNotesProps> = ({ note, notes, onOpenNote }) => {
    const related = useMemo(() => relatedNotes(note, notes, 5), [note, notes]);
    if (related.length === 0) return null;

    return (
        <section className="shrink-0">
            <Divider />
            <div className="px-4 pt-3 pb-1 font-sans text-xs font-medium text-ink-2">Related notes</div>
            <div className="px-2 pb-3 space-y-0.5 max-h-52 overflow-y-auto custom-scrollbar">
                {related.map(({ note: n }) => (
                    <button
                        key={n.id}
                        onClick={() => onOpenNote(n)}
                        className="w-full text-left px-2.5 py-2 rounded-[var(--r)] hover:bg-[var(--card-2)] transition-colors group"
                    >
                        <div className="font-serif text-[15px] leading-snug text-ink group-hover:text-[var(--mark)] truncate transition-colors">
                            {n.title || 'Untitled'}
                        </div>
                        <div className="font-mono text-[10px] text-ink-3 mt-0.5 flex items-center gap-1">
                            <Icon name={TYPE_ICON[n.type] || 'notes'} size={11} />
                            {n.type.toLowerCase()}{n.date ? ` · ${n.date}` : ''}
                        </div>
                    </button>
                ))}
            </div>
        </section>
    );
};

export default RelatedNotes;
