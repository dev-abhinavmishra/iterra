import React, { useMemo } from 'react';
import { useStore } from '../../store';
import { getNoteIndex } from '../../lib/notes';
import { formatDistanceToNow } from 'date-fns';
import { Undo2, Trash2, Trash } from 'lucide-react';
import { hashOf } from '../../lib/ink-shapes';
import { Strike } from '../../lib/ink';
import { useNow } from '../../lib/useNow';

export const TrashView: React.FC = () => {
  const { notes, restoreNote, deleteForever, emptyTrash } = useStore();
  const now = useNow();
  const trashed = notes
    .filter(n => n.trashedAt)
    .sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0));
  const index = useMemo(() => getNoteIndex(notes), [notes]);

  return (
    <div className="flex-1 overflow-y-auto bg-desk custom-scrollbar">
      <div className="max-w-3xl mx-auto px-6 md:px-10 py-10 md:py-14 pb-28">
        <div className="flex items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="font-serif text-3xl font-semibold text-ink tracking-tight">The wastebasket</h1>
            <p className="text-sm text-ink-faint mt-1.5">
              {trashed.length === 0
                ? 'Nothing crumpled up. Discarded pages wait here for a second thought.'
                : `${trashed.length} crossed-out ${trashed.length === 1 ? 'page' : 'pages'} waiting. Smooth them back out or let them go.`}
            </p>
          </div>
          {trashed.length > 0 && (
            <button
              onClick={() => { if (window.confirm(`Permanently delete ${trashed.length} ${trashed.length === 1 ? 'page' : 'pages'}? Once burned, unrecoverable.`)) emptyTrash(); }}
              className="flex items-center gap-1.5 text-[13px] font-medium text-pencil hover:text-pencil-deep transition-colors flex-shrink-0"
            >
              <Trash className="w-3.5 h-3.5" strokeWidth={1.75} />
              Empty the basket
            </button>
          )}
        </div>

        {trashed.length === 0 ? (
          <div className="py-20 text-center">
            <p className="font-serif text-lg text-ink-ghost">An empty basket — the sign of either confidence or a good memory.</p>
          </div>
        ) : (
          <div className="bg-paper border border-line rounded divide-y divide-line overflow-hidden paper-grain">
            {trashed.map(note => {
              // Old slips dry out and fade like paper left in the sun.
              const daysInBin = note.trashedAt ? (now - note.trashedAt) / 86400000 : 0;
              const fade = Math.max(0.42, Math.min(0.95, 0.95 - daysInBin * 0.05));
              return (
              <div
                key={note.id}
                className="group flex items-center gap-4 px-5 py-4 hover:bg-paper-dim/60 transition-colors"
                style={{ transform: `rotate(${(hashOf(note.id) - 0.5) * 0.9}deg)`, opacity: fade }}
              >
                <div className="flex-1 min-w-0">
                  <p className="relative self-start inline-block max-w-full font-serif font-medium text-[15px] text-ink-faint truncate">
                    {note.title || 'Untitled'}
                    <Strike seed={note.id} stretch className="absolute inset-x-0 top-1/2 -translate-y-1/2 w-full h-[10px] pointer-events-none" />
                  </p>
                  <p className="text-xs text-ink-faint truncate mt-0.5 font-serif opacity-70">{(index.get(note.id)?.text ?? '').slice(0, 90) || 'A blank page.'}</p>
                  <p className="font-mono text-2xs text-ink-ghost mt-1">
                    discarded {formatDistanceToNow(note.trashedAt!, { addSuffix: true })}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => restoreNote(note.id)}
                    className="flex items-center gap-1.5 text-xs font-medium text-ink border border-line rounded px-2.5 py-1.5 hover:bg-paper-dim transition-colors"
                  >
                    <Undo2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                    Smooth back out
                  </button>
                  <button
                    onClick={() => { if (window.confirm(`Permanently delete “${note.title || 'Untitled'}”?`)) deleteForever(note.id); }}
                    aria-label={`Delete ${note.title || 'Untitled'} forever`}
                    title="Delete forever"
                    className="w-8 h-8 flex items-center justify-center rounded text-ink-ghost hover:text-pencil hover:bg-pencil-wash transition-colors"
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
