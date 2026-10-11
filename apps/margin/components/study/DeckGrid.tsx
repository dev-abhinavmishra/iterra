import React from 'react';
import { Deck } from '../../types';
import { Card, Icon, IconBtn } from '../ui/primitives';
import { dueCards } from '../../services/studyService';

interface DeckGridProps {
    decks: Deck[];
    onOpen: (deck: Deck) => void;
    onEdit: (deck: Deck) => void;
    onNew: () => void;
}

const DeckGrid: React.FC<DeckGridProps> = ({ decks, onOpen, onEdit, onNew }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {decks.map(deck => {
            const due = dueCards(deck).length;
            return (
                <Card key={deck.id} interactive onClick={() => onOpen(deck)} className="p-4 group relative sheet-ruled">
                    <div className="flex items-start justify-between gap-2">
                        <h3 className="font-serif text-lg leading-snug text-ink line-clamp-2 min-h-[1.5em]">
                            {deck.title || 'Untitled deck'}
                        </h3>
                        <IconBtn
                            icon="edit"
                            size={16}
                            title="Edit deck"
                            onClick={e => { e.stopPropagation(); onEdit(deck); }}
                            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 -mt-1 -mr-1"
                        />
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-line flex items-baseline">
                        <span className="font-mono text-xs text-ink-3">
                            {deck.cards.length} {deck.cards.length === 1 ? 'card' : 'cards'}
                            <span className={due > 0 ? ' text-mark' : ''}> · {due} due</span>
                        </span>
                    </div>
                </Card>
            );
        })}

        <button
            onClick={onNew}
            className="min-h-[7.5rem] rounded-[var(--r-lg)] border border-dashed border-[var(--line-2)]
                flex flex-col items-center justify-center gap-1.5 text-ink-3
                hover:text-ink hover:border-[var(--ink-3)] hover:bg-[var(--card-2)] transition-colors duration-150"
        >
            <Icon name="add" size={20} />
            <span className="text-sm font-medium">New deck</span>
        </button>
    </div>
);

export default DeckGrid;
