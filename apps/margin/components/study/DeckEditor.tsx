import React, { useRef, useState } from 'react';
import { Deck, Note } from '../../types';
import { Btn, Divider, Icon, IconBtn, Modal } from '../ui/primitives';
import { dueCards, newCard } from '../../services/studyService';
import { saveDeck, deleteDeck } from '../../services/storageService';

interface DeckEditorProps {
    deck: Deck;
    sourceNote?: Note;
    onBack: (deck: Deck) => void;
    onDelete: (deck: Deck) => void;
    onReview: (deck: Deck) => void;
    onOpenNote?: (note: Note) => void;
}

/* Card list + rename + delete. Edits persist to IndexedDB when focus leaves
   a row; a new card only lands once it has content. */
const DeckEditor: React.FC<DeckEditorProps> = ({ deck: initialDeck, sourceNote, onBack, onDelete, onReview, onOpenNote }) => {
    const [deck, setDeck] = useState<Deck>(initialDeck);
    const deckRef = useRef(deck);
    deckRef.current = deck;
    const [confirming, setConfirming] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [draft, setDraft] = useState<{ front: string; back: string } | null>(null);
    const draftRef = useRef(draft);
    draftRef.current = draft;

    const persist = (updated: Deck) => {
        setDeck(updated);
        deckRef.current = updated;
        saveDeck(updated).catch(e => console.error('Failed to save deck', e));
    };

    const setCardField = (cardId: string, field: 'front' | 'back', value: string) => {
        const updated = {
            ...deckRef.current,
            cards: deckRef.current.cards.map(c => c.id === cardId ? { ...c, [field]: value } : c),
        };
        setDeck(updated);
        deckRef.current = updated;
    };

    /* A row only commits when focus leaves it — blurring between the front
       and back inputs must not save a half-written card. */
    const rowBlur = (e: React.FocusEvent, commit: () => void) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) commit();
    };

    const commitCard = (cardId: string) => {
        // Trim + drop a card that ended up fully empty.
        const cleaned = {
            ...deckRef.current,
            cards: deckRef.current.cards
                .map(c => c.id === cardId ? { ...c, front: c.front.trim(), back: c.back.trim() } : c)
                .filter(c => c.front !== '' || c.back !== ''),
        };
        persist(cleaned);
    };

    // The new card lives in `draft` until it has content — an untouched draft
    // never reaches the deck, so it can't inflate the due count.
    const addCard = () => {
        setDraft({ front: '', back: '' });
    };

    const commitDraft = () => {
        const d = draftRef.current;
        setDraft(null);
        if (d && (d.front.trim() || d.back.trim())) {
            persist({ ...deckRef.current, cards: [...deckRef.current.cards, newCard(d.front.trim(), d.back.trim())] });
        }
    };

    const removeCard = (cardId: string) => {
        persist({ ...deckRef.current, cards: deckRef.current.cards.filter(c => c.id !== cardId) });
    };

    const rename = (title: string) => persist({ ...deckRef.current, title: title.trim() || 'Untitled deck' });

    const due = dueCards(deck).length;

    const doDelete = async () => {
        setDeleting(true);
        try {
            await deleteDeck(deck.id);
            onDelete(deckRef.current);
        } catch (e) {
            console.error('Failed to delete deck', e);
            setDeleting(false);
            setConfirming(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col min-w-0 bg-paper">
            <header className="h-14 shrink-0 border-b border-line flex items-center px-4 gap-3">
                <IconBtn icon="arrow_back" title="Back to decks" onClick={() => onBack(deckRef.current)} />
                <input
                    value={deck.title}
                    onChange={e => { const d = { ...deckRef.current, title: e.target.value }; setDeck(d); deckRef.current = d; }}
                    onBlur={e => rename(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    placeholder="Untitled deck"
                    className="font-serif text-lg text-ink bg-transparent min-w-0 flex-1 max-w-md
                        border-b border-transparent focus:border-[var(--mark)] focus:outline-none placeholder:text-ink-3"
                />
                <span className="font-mono text-xs text-ink-3 shrink-0 hidden sm:inline">
                    {deck.cards.length} cards · {due} due
                </span>
                {due > 0 && (
                    <Btn variant="primary" size="sm" onClick={() => onReview(deckRef.current)}>
                        Review {due} due
                    </Btn>
                )}
                <Btn variant="danger" size="sm" icon="delete" onClick={() => setConfirming(true)}>
                    Delete
                </Btn>
            </header>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="max-w-3xl mx-auto px-6 py-6 flex flex-col gap-4">
                    {sourceNote && onOpenNote && (
                        <button
                            onClick={() => onOpenNote(sourceNote)}
                            className="self-start inline-flex items-center gap-1.5 font-mono text-xs text-ink-3 hover:text-mark transition-colors"
                        >
                            <Icon name="north_east" size={14} />
                            from note: {sourceNote.title || 'Untitled'}
                        </button>
                    )}

                    <div className="bg-card border border-line rounded-[var(--r-lg)] shadow-card overflow-hidden">
                        <div className="grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-3 px-4 h-9 border-b border-line bg-card-2">
                            <span className="font-mono text-[10px] text-ink-3">#</span>
                            <span className="font-mono text-[10px] text-ink-3">front</span>
                            <span className="font-mono text-[10px] text-ink-3">back</span>
                            <span />
                        </div>

                        {deck.cards.length === 0 && (
                            <p className="px-4 py-8 text-center text-sm text-ink-3">
                                No cards yet — add the first one below.
                            </p>
                        )}

                        {deck.cards.map((card, i) => (
                            <div
                                key={card.id}
                                className="grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-3 px-4 py-1.5 border-b border-line group"
                                onBlur={e => rowBlur(e, () => commitCard(card.id))}
                            >
                                <span className="font-mono text-[10px] text-ink-3">{i + 1}</span>
                                <input
                                    value={card.front}
                                    onChange={e => setCardField(card.id, 'front', e.target.value)}
                                    placeholder="Front"
                                    className="h-8 px-2 rounded-[var(--r)] bg-transparent border border-transparent text-sm text-ink font-serif
                                        hover:border-[var(--line)] focus:border-[var(--mark)] focus:bg-[var(--card-2)] focus:outline-none placeholder:text-ink-3"
                                />
                                <input
                                    value={card.back}
                                    onChange={e => setCardField(card.id, 'back', e.target.value)}
                                    placeholder="Back"
                                    className="h-8 px-2 rounded-[var(--r)] bg-transparent border border-transparent text-sm text-ink
                                        hover:border-[var(--line)] focus:border-[var(--mark)] focus:bg-[var(--card-2)] focus:outline-none placeholder:text-ink-3"
                                />
                                <IconBtn
                                    icon="close"
                                    size={15}
                                    title="Remove card"
                                    danger
                                    onClick={() => removeCard(card.id)}
                                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                                />
                            </div>
                        ))}

                        {draft && (
                            <div
                                className="grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-3 px-4 py-1.5 border-b border-line"
                                onBlur={e => rowBlur(e, commitDraft)}
                            >
                                <span className="font-mono text-[10px] text-ink-3">{deck.cards.length + 1}</span>
                                <input
                                    autoFocus
                                    value={draft.front}
                                    onChange={e => setDraft(d => d && { ...d, front: e.target.value })}
                                    placeholder="Front"
                                    className="h-8 px-2 rounded-[var(--r)] bg-transparent border border-transparent text-sm text-ink font-serif
                                        hover:border-[var(--line)] focus:border-[var(--mark)] focus:bg-[var(--card-2)] focus:outline-none placeholder:text-ink-3"
                                />
                                <input
                                    value={draft.back}
                                    onChange={e => setDraft(d => d && { ...d, back: e.target.value })}
                                    placeholder="Back"
                                    className="h-8 px-2 rounded-[var(--r)] bg-transparent border border-transparent text-sm text-ink
                                        hover:border-[var(--line)] focus:border-[var(--mark)] focus:bg-[var(--card-2)] focus:outline-none placeholder:text-ink-3"
                                />
                                <IconBtn
                                    icon="close"
                                    size={15}
                                    title="Discard card"
                                    danger
                                    onClick={() => setDraft(null)}
                                />
                            </div>
                        )}

                        <button
                            onClick={addCard}
                            className="w-full h-10 flex items-center justify-center gap-1.5 text-sm text-ink-3
                                hover:text-ink hover:bg-[var(--card-2)] transition-colors"
                        >
                            <Icon name="add" size={16} />
                            Add card
                        </button>
                    </div>
                </div>
            </div>

            <Modal open={confirming} onClose={() => setConfirming(false)}>
                <div className="p-5">
                    <h3 className="font-serif text-lg text-ink">Delete this deck?</h3>
                    <p className="text-sm text-ink-2 mt-1.5">
                        "{deck.title || 'Untitled deck'}" and its {deck.cards.length} {deck.cards.length === 1 ? 'card' : 'cards'} will be gone.
                    </p>
                    <Divider className="my-4" />
                    <div className="flex justify-end gap-2">
                        <Btn size="sm" onClick={() => setConfirming(false)}>Keep it</Btn>
                        <Btn size="sm" variant="danger" onClick={doDelete} disabled={deleting}>
                            {deleting ? 'Deleting…' : 'Delete deck'}
                        </Btn>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default DeckEditor;
