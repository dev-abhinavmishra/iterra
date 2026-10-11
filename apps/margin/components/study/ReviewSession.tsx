import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Deck, Flashcard } from '../../types';
import { Btn, Icon, IconBtn } from '../ui/primitives';
import { dueCards, gradeCard, reviewCard } from '../../services/studyService';

interface ReviewSessionProps {
    deck: Deck;
    onExit: (deck: Deck) => void;
}

type Grade = 0 | 1 | 2 | 3;
const GRADES: { grade: Grade; label: string; key: string }[] = [
    { grade: 0, label: 'Again', key: '1' },
    { grade: 1, label: 'Hard', key: '2' },
    { grade: 2, label: 'Good', key: '3' },
    { grade: 3, label: 'Easy', key: '4' },
];

const intervalLabel = (days: number): string => {
    if (days <= 0) return 'now';
    if (days < 30) return `${days}d`;
    if (days < 365) return `${Math.round(days / 30)}mo`;
    return `${(days / 365).toFixed(1).replace(/\.0$/, '')}y`;
};

const elapsedLabel = (ms: number): string => {
    const s = Math.max(1, Math.round(ms / 1000));
    if (s < 60) return `${s}s`;
    return `${Math.round(s / 60)}m`;
};

/* Full-view SM-2 review: one index card at a time, real 3D flip. */
const ReviewSession: React.FC<ReviewSessionProps> = ({ deck: initialDeck, onExit }) => {
    const [deck, setDeck] = useState(initialDeck);
    const deckRef = useRef(deck);
    deckRef.current = deck;

    const initialQueue = useMemo(() => dueCards(initialDeck), [initialDeck]);
    const [queue, setQueue] = useState<Flashcard[]>(initialQueue);
    const [idx, setIdx] = useState(0);
    const [flipped, setFlipped] = useState(false);
    const [counts, setCounts] = useState({ again: 0, hard: 0, good: 0, easy: 0 });
    const [gradedIds, setGradedIds] = useState<Set<string>>(new Set());
    const [done, setDone] = useState(initialQueue.length === 0);
    const startedAt = useRef(Date.now());
    const grading = useRef(false);

    const total = initialQueue.length;
    const card = queue[idx];

    const flip = useCallback(() => setFlipped(f => !f), []);

    const grade = useCallback(async (g: Grade) => {
        if (!flipped || done || grading.current || !card) return;
        grading.current = true;
        try {
            const updated = await reviewCard(deckRef.current, card.id, g);
            setDeck(updated);
            deckRef.current = updated;
            setCounts(c => ({
                again: c.again + (g === 0 ? 1 : 0),
                hard: c.hard + (g === 1 ? 1 : 0),
                good: c.good + (g === 2 ? 1 : 0),
                easy: c.easy + (g === 3 ? 1 : 0),
            }));
            setGradedIds(s => new Set(s).add(card.id));
            const updatedCard = updated.cards.find(c => c.id === card.id);
            if (g === 0 && updatedCard) {
                // Relearn: due stays "now" — see it again at the end of the queue.
                setQueue(q => [...q, updatedCard]);
            }
            setFlipped(false);
            if (idx + 1 >= queue.length + (g === 0 ? 1 : 0)) {
                setDone(true);
            } else {
                setIdx(i => i + 1);
            }
        } finally {
            grading.current = false;
        }
    }, [flipped, done, card, idx, queue.length]);

    const exit = useCallback(() => onExit(deckRef.current), [onExit]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement;
            if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
            if (e.key === ' ') { e.preventDefault(); flip(); }
            else if (e.key === 'Escape') { e.preventDefault(); exit(); }
            else if (flipped && ['1', '2', '3', '4'].includes(e.key)) {
                e.preventDefault();
                grade(Number(e.key) - 1 as Grade);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [flip, exit, flipped, grade]);

    /* ---- end screen ---- */
    if (done) {
        const reviewed = gradedIds.size;
        return (
            <div className="flex-1 flex flex-col min-w-0 bg-paper">
                <header className="h-14 shrink-0 border-b border-line flex items-center px-4 gap-3">
                    <IconBtn icon="arrow_back" title="Back to decks" onClick={exit} />
                    <span className="font-serif text-lg text-ink truncate">{deck.title || 'Untitled deck'}</span>
                </header>
                <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6">
                    <div className="w-12 h-12 rounded-[var(--r-lg)] border border-line bg-card shadow-card flex items-center justify-center">
                        <Icon name="task_alt" size={22} className="text-mark" />
                    </div>
                    <div className="text-center">
                        <h2 className="font-serif text-2xl text-ink">Done</h2>
                        <p className="text-sm text-ink-2 mt-1">Next review lands tomorrow.</p>
                    </div>
                    <p className="font-mono text-xs text-ink-3">
                        {reviewed} reviewed · {counts.again} again · {elapsedLabel(Date.now() - startedAt.current)}
                    </p>
                    <Btn variant="primary" onClick={exit}>Back to decks</Btn>
                </div>
            </div>
        );
    }

    if (!card) return null;

    const progress = Math.min(gradedIds.size + 1, total);

    return (
        <div className="flex-1 flex flex-col min-w-0 bg-paper">
            <header className="h-14 shrink-0 border-b border-line flex items-center px-4 gap-3">
                <IconBtn icon="arrow_back" title="Back to decks" onClick={exit} />
                <span className="font-serif text-lg text-ink truncate">{deck.title || 'Untitled deck'}</span>
                <span className="flex-1" />
                <span className="font-mono text-xs text-ink-3">{progress}/{total}</span>
            </header>

            <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 py-8 min-h-0">
                {/* the card */}
                <div className="perspective-1000 w-full max-w-2xl pop-in" key={card.id}>
                    <div
                        onClick={flip}
                        className={`flip-inner relative w-full h-[20rem] sm:h-[22rem] transform-style-3d cursor-pointer select-none ${flipped ? 'rotate-y-180' : ''}`}
                        role="button"
                        aria-label={flipped ? 'Card back — click to see front' : 'Card front — click to flip'}
                    >
                        {/* front */}
                        <div className="backface-hidden absolute inset-0 bg-card border border-line rounded-[var(--r-lg)] shadow-card flex flex-col overflow-hidden">
                            <span className="absolute top-3 left-4 font-mono text-[10px] text-ink-3 z-10">front</span>
                            <div className="flex-1 overflow-y-auto custom-scrollbar px-8 py-10 flex items-center justify-center card-ruled">
                                <p className="font-serif text-xl sm:text-2xl leading-relaxed text-ink text-center">{card.front}</p>
                            </div>
                            <div className="h-8 border-t border-line flex items-center justify-center">
                                <span className="font-mono text-[10px] text-ink-3">space to flip</span>
                            </div>
                        </div>
                        {/* back */}
                        <div className="backface-hidden rotate-y-180 absolute inset-0 bg-card border border-line rounded-[var(--r-lg)] shadow-card flex flex-col overflow-hidden">
                            <span className="absolute top-3 left-4 font-mono text-[10px] text-mark z-10">answer</span>
                            <div className="flex-1 overflow-y-auto custom-scrollbar px-8 py-10 flex items-center justify-center card-ruled">
                                <p className="font-serif text-lg sm:text-xl leading-relaxed text-ink text-center">{card.back}</p>
                            </div>
                            <div className="h-8 border-t border-line flex items-center justify-center">
                                <span className="font-mono text-[10px] text-ink-3">grade it — keys 1–4</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* controls */}
                <div className="h-14 flex items-center">
                    {flipped ? (
                        <div className="flex items-stretch gap-2 rise">
                            {GRADES.map(({ grade: g, label, key }) => (
                                <button
                                    key={g}
                                    onClick={() => grade(g)}
                                    className={`w-20 sm:w-24 py-2 rounded-[var(--r)] border bg-card shadow-card flex flex-col items-center gap-0.5 transition-colors duration-150 active:scale-[0.98]
                                        ${g === 0 ? 'border-[var(--bad)]/40 hover:bg-[var(--bad)]/10' : 'border-[var(--line-2)] hover:border-[var(--ink-3)] hover:bg-[var(--card-2)]'}`}
                                >
                                    <span className={`text-sm font-sans font-medium ${g === 0 ? 'text-bad' : 'text-ink'}`}>{label}</span>
                                    <span className="font-mono text-[10px] text-ink-3">
                                        {key} · {intervalLabel(gradeCard(card, g).interval)}
                                    </span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <span className="font-mono text-xs text-ink-3">read the front, then flip — <span className="text-ink-2">space</span></span>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ReviewSession;
