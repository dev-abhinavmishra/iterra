import React, { useState } from 'react';
import { sanitizeHtml } from '../../services/sanitize';
import { Btn, Icon, IconBtn } from '../ui/primitives';
import { createDeck } from '../../services/studyService';

interface FlashcardWidgetProps {
    data: any;
}

const normalizeCards = (data: any): { front: string; back: string }[] => {
    if (Array.isArray(data)) return data.filter(c => c && c.front && c.back);
    if (Array.isArray(data?.cards)) return data.cards.filter((c: any) => c && c.front && c.back);
    if (data?.front && data?.back) return [{ front: data.front, back: data.back }];
    return [];
};

/* Paper flashcard with a real 3D flip. Multiple cards page through one at a time. */
const FlashcardWidget: React.FC<FlashcardWidgetProps> = ({ data }) => {
    const cards = normalizeCards(data);
    const [index, setIndex] = useState(0);
    const [flipped, setFlipped] = useState(false);
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);

    if (cards.length === 0) return null;
    const card = cards[Math.min(index, cards.length - 1)];

    const goto = (i: number) => {
        setFlipped(false);
        setIndex(i);
    };

    const handleSave = async () => {
        if (saved || saving) return;
        setSaving(true);
        try {
            await createDeck(data?.title || 'Cards from Ask', cards);
            setSaved(true);
        } catch (e) {
            console.error('Save deck failed', e);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-md mx-auto">
            <div
                className="perspective-1000 h-56 cursor-pointer select-none"
                onClick={() => setFlipped(f => !f)}
                role="button"
                aria-label={flipped ? 'Show front of card' : 'Reveal answer'}
            >
                <div className={`flip-inner relative w-full h-full ${flipped ? 'rotate-y-180' : ''}`}>
                    {/* Front */}
                    <div className="absolute inset-0 backface-hidden bg-card border border-line rounded-[var(--r-lg)] shadow-card p-6 flex flex-col">
                        <div className="flex items-center justify-between">
                            <span className="font-mono text-[10px] text-ink-3">front</span>
                            {cards.length > 1 && (
                                <span className="font-mono text-[10px] text-ink-3">{index + 1} / {cards.length}</span>
                            )}
                        </div>
                        <div className="flex-1 flex items-center justify-center overflow-y-auto custom-scrollbar">
                            <p className="font-serif text-xl text-ink text-center leading-snug" dangerouslySetInnerHTML={{ __html: sanitizeHtml(card.front) }} />
                        </div>
                        <div className="flex items-center justify-center gap-1.5 text-ink-3">
                            <Icon name="sync" size={13} />
                            <span className="font-mono text-[10px]">click to flip</span>
                        </div>
                    </div>
                    {/* Back */}
                    <div className="absolute inset-0 backface-hidden rotate-y-180 bg-card-2 border border-line-2 rounded-[var(--r-lg)] shadow-card p-6 flex flex-col">
                        <div className="flex items-center justify-between border-b border-line pb-2">
                            <span className="font-mono text-[10px] text-mark">answer</span>
                            {cards.length > 1 && (
                                <span className="font-mono text-[10px] text-ink-3">{index + 1} / {cards.length}</span>
                            )}
                        </div>
                        <div className="flex-1 flex items-center justify-center overflow-y-auto custom-scrollbar">
                            <p className="font-serif text-base text-ink text-center leading-relaxed" dangerouslySetInnerHTML={{ __html: sanitizeHtml(card.back) }} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Pager + save */}
            <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-1">
                    {cards.length > 1 && (
                        <>
                            <IconBtn icon="chevron_left" size={16} title="Previous card" disabled={index === 0}
                                onClick={() => goto(index - 1)} />
                            <IconBtn icon="chevron_right" size={16} title="Next card" disabled={index >= cards.length - 1}
                                onClick={() => goto(index + 1)} />
                        </>
                    )}
                </div>
                <Btn
                    size="sm"
                    onClick={handleSave}
                    disabled={saved || saving}
                    icon={saved ? 'check' : 'bookmark_add'}
                >
                    {saved ? 'Saved to Study' : saving ? 'Saving…' : 'Save to Study'}
                </Btn>
            </div>
        </div>
    );
};

export default FlashcardWidget;
