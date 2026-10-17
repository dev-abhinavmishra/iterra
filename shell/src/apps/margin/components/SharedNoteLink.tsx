/* commons read-side: when ink's desk has a fresher active note, offer a
   quiet path to it — renders only in the terrain (iterra doc absent → null). */
import React from 'react';
import { useOtherNoteActive } from '../iterra';

const SharedNoteLink: React.FC = () => {
    const other = useOtherNoteActive();
    if (!other?.v) return null;
    return (
        <a
            href={`/apps/ink/?note=${encodeURIComponent(other.v.id)}`}
            target="_blank"
            rel="noreferrer"
            title={`Open "${other.v.title}" in ink`}
            className="hidden sm:inline-flex items-center gap-1 h-8 px-2 rounded-[var(--r-sm)] font-sans text-[12px] text-ink-3 hover:text-ink hover:bg-[var(--card-2)] transition-colors max-w-[180px] truncate"
        >
            on ink's desk: {other.v.title} →
        </a>
    );
};

export default SharedNoteLink;
