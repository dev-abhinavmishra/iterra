/* Make recall card — the quick confirm between selecting a sentence and a
   flashcards card existing. Front defaults to the sentence itself, back to
   the source note; both editable, Cancel writes nothing. Saving goes through
   execCommand('createDeckFromSelection') — the canonical path — so the card
   lands in flashcards' own store with provenance (sourceRef/sourceUrl) the
   course "linked work" views already read. */
import React, { useEffect, useRef, useState } from 'react';
import { execCommand } from '../../../../integration/commands';
import { useStore, type Note } from '../../store';
import {
  recallCardPayload,
  recallFrontFromSelection,
  recallBackDefault,
  noteDeepLink,
} from '../../lib/recall';

interface RecallCardModalProps {
  note: Note;
  selection: string;
  onClose: () => void;
  onCreated?: (url: string | undefined) => void;
}

export const RecallCardModal: React.FC<RecallCardModalProps> = ({
  note,
  selection,
  onClose,
  onCreated,
}) => {
  const [front, setFront] = useState(() => recallFrontFromSelection(selection));
  const [back, setBack] = useState(() => recallBackDefault(note));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !savingRef.current) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingRef.current) return;
    if (!front.trim() || !back.trim()) {
      setError('Both sides of the card need words.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const res = await execCommand<{ deckId?: string }>('createDeckFromSelection',
        recallCardPayload(note, selection, front, back));
      if (!res.ok) {
        setError(res.error || 'Couldn’t file the card.');
        return;
      }
      const deckId = res.data?.deckId;
      useStore.getState().setNotice({
        message: `Recall card filed${deckId ? ' in “Recall — Ink”' : ''}`,
      });
      onCreated?.(res.url);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/40 p-4"
      onClick={() => { if (!savingRef.current) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Make recall card"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="w-full max-w-md rounded-md border border-line bg-paper shadow-pop p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="font-serif text-lg font-semibold text-ink">Make recall card</h3>
            <p className="text-2xs font-mono text-ink-ghost mt-0.5">
              from “{note.title || 'Untitled'}” · links back to {noteDeepLink(note.id)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Cancel"
            className="w-7 h-7 flex items-center justify-center rounded text-ink-faint hover:text-ink hover:bg-paper-dim transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          <label className="block">
            <span className="block text-2xs font-mono uppercase tracking-[0.14em] text-ink-ghost mb-1">Front — the prompt</span>
            <textarea
              value={front}
              onChange={e => setFront(e.target.value)}
              rows={3}
              className="w-full rounded-sm border border-line bg-paper-dim px-2.5 py-2 font-serif text-sm text-ink focus:ring-0 focus:border-fountain resize-none"
            />
          </label>
          <label className="block">
            <span className="block text-2xs font-mono uppercase tracking-[0.14em] text-ink-ghost mb-1">Back — the answer</span>
            <textarea
              value={back}
              onChange={e => setBack(e.target.value)}
              rows={2}
              className="w-full rounded-sm border border-line bg-paper-dim px-2.5 py-2 font-serif text-sm text-ink focus:ring-0 focus:border-fountain resize-none"
            />
          </label>
          {error && <p className="text-xs text-red-700">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-3 py-1.5 rounded-sm font-sans text-xs text-ink-faint hover:text-ink hover:bg-paper-dim transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-3.5 py-1.5 rounded-sm bg-ink text-paper font-sans text-xs hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? 'Filing…' : 'File the card'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
