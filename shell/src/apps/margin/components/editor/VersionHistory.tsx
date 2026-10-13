import React, { useEffect, useState } from 'react';
import { NoteVersion } from '../../types';
import { getNoteVersions } from '../../services/storageService';
import { Btn, Spinner, Divider } from '../ui/primitives';
import { sanitizeHtml } from '../../services/sanitize';

interface VersionHistoryProps {
    noteId: string;
    refreshKey?: number;
    onRestore: (html: string) => void;
}

const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
};

const VersionHistory: React.FC<VersionHistoryProps> = ({ noteId, refreshKey, onRestore }) => {
    const [versions, setVersions] = useState<NoteVersion[] | null>(null);
    const [selected, setSelected] = useState<NoteVersion | null>(null);
    const [confirming, setConfirming] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setVersions(null);
        setSelected(null);
        getNoteVersions(noteId)
            .then(v => { if (!cancelled) setVersions(v); })
            .catch(() => { if (!cancelled) setVersions([]); });
        return () => { cancelled = true; };
    }, [noteId, refreshKey]);

    if (versions === null) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <Spinner size={18} />
            </div>
        );
    }

    if (versions.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center p-6">
                <p className="font-serif italic text-sm text-ink-3 text-center">
                    No earlier versions yet — snapshots are kept each time the note is saved.
                </p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-h-0">
            <div className="h-9 shrink-0 border-b border-line flex items-center px-4">
                <span className="font-mono text-[10px] text-ink-3">{versions.length} version{versions.length === 1 ? '' : 's'}</span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
                {versions.map(v => (
                    <button
                        key={v.id}
                        onClick={() => { setSelected(v); setConfirming(false); }}
                        className={`w-full text-left px-4 py-2 transition-colors
                            ${selected?.id === v.id
                                ? 'bg-[var(--mark-soft)] border-l-2 border-[var(--mark)]'
                                : 'hover:bg-[var(--card-2)] border-l-2 border-transparent'}`}
                    >
                        <div className="font-mono text-[11px] text-ink">{fmt(v.savedAt)}</div>
                        <div className="font-sans text-xs text-ink-3 truncate mt-0.5">{v.title || 'Untitled'}</div>
                    </button>
                ))}
            </div>
            {selected && (
                <div className="shrink-0 border-t border-line flex flex-col max-h-[55%]">
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3">
                        <div
                            className="note-body text-[13px] border border-line rounded-[var(--r)] bg-card-2 p-3 [&_*]:!text-ink-2"
                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(selected.content) }}
                        />
                    </div>
                    <Divider />
                    <div className="p-2.5 flex items-center justify-between gap-2">
                        {confirming ? (
                            <>
                                <span className="font-sans text-xs text-ink-2">Replace the current note?</span>
                                <div className="flex items-center gap-1.5">
                                    <Btn size="sm" variant="primary" onClick={() => { onRestore(selected.content); setConfirming(false); }}>Restore</Btn>
                                    <Btn size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Btn>
                                </div>
                            </>
                        ) : (
                            <>
                                <span className="font-mono text-[10px] text-ink-3">{fmt(selected.savedAt)}</span>
                                <Btn size="sm" onClick={() => setConfirming(true)}>Restore this version</Btn>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default VersionHistory;
