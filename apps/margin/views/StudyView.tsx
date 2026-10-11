import React, { useCallback, useEffect, useState } from 'react';
import { Deck, Note, Quiz, QuizQuestion } from '../types';
import { Btn, Card, Divider, EmptyState, Icon, IconBtn, Modal, Segmented, Spinner } from '../components/ui/primitives';
import DeckGrid from '../components/study/DeckGrid';
import DeckEditor from '../components/study/DeckEditor';
import ReviewSession from '../components/study/ReviewSession';
import QuizRunner from '../components/study/QuizRunner';
import { createDeck, createQuiz, correctOptionIndex, dueCards, getAllDecks, getAllQuizzes, totalDue } from '../services/studyService';
import { deleteQuiz } from '../services/storageService';
import { parseJsonArray, runAction } from '../services/aiService';

interface StudyViewProps {
    notes: Note[];
    onOpenNote?: (note: Note) => void;
}

type Screen =
    | { kind: 'browse' }
    | { kind: 'review'; deck: Deck }
    | { kind: 'edit'; deck: Deck }
    | { kind: 'quiz'; quiz: Quiz };

type GenTarget = 'deck' | 'quiz';

const usableNotes = (notes: Note[]): Note[] =>
    notes.filter(n => (n.transcript && n.transcript.trim()) || (n.content && n.content.trim()));

const StudyView: React.FC<StudyViewProps> = ({ notes, onOpenNote }) => {
    const [decks, setDecks] = useState<Deck[] | null>(null);
    const [quizzes, setQuizzes] = useState<Quiz[] | null>(null);
    const [tab, setTab] = useState<'decks' | 'quizzes'>('decks');
    const [screen, setScreen] = useState<Screen>({ kind: 'browse' });

    const [picking, setPicking] = useState<GenTarget | null>(null);
    const [generating, setGenerating] = useState(false);
    const [genError, setGenError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        const [d, q] = await Promise.all([getAllDecks(), getAllQuizzes()]);
        setDecks(d);
        setQuizzes(q);
    }, []);

    useEffect(() => { refresh().catch(e => console.error('Failed to load study data', e)); }, [refresh]);

    const due = totalDue(decks || []);

    /* ---- deck actions ---- */

    const newDeck = async () => {
        const deck = await createDeck('Untitled deck', []);
        await refresh();
        setScreen({ kind: 'edit', deck });
    };

    const openDeck = (deck: Deck) => {
        setScreen(dueCards(deck).length > 0 ? { kind: 'review', deck } : { kind: 'edit', deck });
    };

    /* ---- generate from a note ---- */

    const pickNote = async (note: Note) => {
        if (!picking || generating) return;
        const target = picking;
        setGenerating(true);
        setGenError(null);
        const text = (note.transcript && note.transcript.trim()) || note.content;
        try {
            if (target === 'deck') {
                const res = await runAction('flashcards', text);
                if (res.error) { setGenError(res.error); return; }
                const cards = parseJsonArray<{ front?: string; back?: string }>(res.content)
                    .filter(c => typeof c?.front === 'string' && typeof c?.back === 'string' && c.front.trim() && c.back.trim());
                if (cards.length === 0) {
                    setGenError("Couldn't make cards from that note. Try another one.");
                } else {
                    const deck = await createDeck(note.title || 'Untitled deck', cards as { front: string; back: string }[], note.id);
                    await refresh();
                    setPicking(null);
                    setScreen({ kind: 'edit', deck });
                }
            } else {
                const res = await runAction('quiz', text);
                if (res.error) { setGenError(res.error); return; }
                const questions = parseJsonArray<QuizQuestion>(res.content)
                    .filter(q => typeof q?.question === 'string' && Array.isArray(q?.options)
                        && q.options.length >= 2 && typeof q?.answer === 'string')
                    // Keep only questions whose answer resolves to an option;
                    // normalize to the option's exact text so grading can't miss.
                    .map(q => {
                        const i = correctOptionIndex(q.options, q.answer);
                        return i === -1 ? null : { ...q, answer: q.options[i] };
                    })
                    .filter((q): q is QuizQuestion => q !== null);
                if (questions.length === 0) {
                    setGenError("Couldn't make a quiz from that note. Try another one.");
                } else {
                    const quiz = await createQuiz(note.title || 'Untitled quiz', questions, note.id);
                    await refresh();
                    setPicking(null);
                    setScreen({ kind: 'quiz', quiz });
                }
            }
        } catch (e) {
            console.error('Generation failed', e);
            setGenError('Something went wrong. Try again.');
        } finally {
            setGenerating(false);
        }
    };

    const removeQuiz = async (quiz: Quiz) => {
        setQuizzes(qs => (qs || []).filter(q => q.id !== quiz.id));
        try {
            await deleteQuiz(quiz.id);
        } catch (e) {
            console.error('Failed to delete quiz', e);
            refresh();
        }
    };

    /* ---- takeovers ---- */

    if (screen.kind === 'review') {
        return (
            <main className="flex-1 flex flex-col min-w-0 bg-paper">
                <ReviewSession
                    deck={screen.deck}
                    onExit={() => { setScreen({ kind: 'browse' }); refresh(); }}
                />
            </main>
        );
    }

    if (screen.kind === 'edit') {
        return (
            <main className="flex-1 flex flex-col min-w-0 bg-paper">
                <DeckEditor
                    deck={screen.deck}
                    sourceNote={notes.find(n => n.id === screen.deck.sourceNoteId)}
                    onBack={() => { setScreen({ kind: 'browse' }); refresh(); }}
                    onDelete={() => { setScreen({ kind: 'browse' }); refresh(); }}
                    onReview={deck => setScreen({ kind: 'review', deck })}
                    onOpenNote={onOpenNote}
                />
            </main>
        );
    }

    if (screen.kind === 'quiz') {
        return (
            <main className="flex-1 flex flex-col min-w-0 bg-paper">
                <QuizRunner
                    quiz={screen.quiz}
                    onExit={() => { setScreen({ kind: 'browse' }); refresh(); }}
                />
            </main>
        );
    }

    /* ---- browse ---- */

    const pickable = usableNotes(notes);
    const loaded = decks !== null && quizzes !== null;

    return (
        <main className="flex-1 flex flex-col min-w-0 bg-paper">
            <header className="h-14 shrink-0 border-b border-line flex items-center px-6 gap-3">
                <h1 className="font-serif text-xl text-ink ink-write ink-underline">Study</h1>
                <span className={`font-mono text-xs ${due > 0 ? 'text-mark' : 'text-ink-3'}`}>{due} due</span>
                <span className="flex-1" />
                <Segmented
                    options={[{ value: 'decks', label: 'Decks' }, { value: 'quizzes', label: 'Quizzes' }]}
                    value={tab}
                    onChange={v => setTab(v as 'decks' | 'quizzes')}
                />
                <Btn size="sm" icon="note_stack" onClick={() => { setGenError(null); setPicking(tab === 'decks' ? 'deck' : 'quiz'); }}>
                    From note
                </Btn>
            </header>

            <div className="flex-1 overflow-y-auto custom-scrollbar page-lines lg:pl-[76px]">
                <div className="max-w-5xl mx-auto px-6 py-6">
                    {!loaded ? (
                        <div className="flex items-center justify-center py-24"><Spinner /></div>
                    ) : tab === 'decks' ? (
                        (decks as Deck[]).length === 0 ? (
                            <EmptyState
                                icon="style"
                                title="No decks yet"
                                body="Decks are flashcards on a spaced schedule. Make one from a note, or start blank."
                                action={
                                    <div className="flex items-center gap-2">
                                        <Btn variant="primary" onClick={newDeck}>New deck</Btn>
                                        <Btn onClick={() => { setGenError(null); setPicking('deck'); }}>From a note</Btn>
                                    </div>
                                }
                            />
                        ) : (
                            <DeckGrid
                                decks={decks as Deck[]}
                                onOpen={openDeck}
                                onEdit={deck => setScreen({ kind: 'edit', deck })}
                                onNew={newDeck}
                            />
                        )
                    ) : (quizzes as Quiz[]).length === 0 ? (
                        <EmptyState
                            icon="quiz"
                            title="No quizzes yet"
                            body="Quizzes are made from a note — a handful of multiple-choice questions."
                            action={<Btn variant="primary" onClick={() => { setGenError(null); setPicking('quiz'); }}>From a note</Btn>}
                        />
                    ) : (
                        <Card className="divide-y divide-[var(--line)]">
                            {(quizzes as Quiz[]).map(quiz => {
                                const last = quiz.attempts[quiz.attempts.length - 1];
                                return (
                                    <div
                                        key={quiz.id}
                                        onClick={() => setScreen({ kind: 'quiz', quiz })}
                                        className="group flex items-center gap-4 px-4 py-3.5 cursor-pointer hover:bg-[var(--card-2)] transition-colors first:rounded-t-[var(--r-lg)] last:rounded-b-[var(--r-lg)]"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <h3 className="font-serif text-base text-ink truncate">{quiz.title || 'Untitled quiz'}</h3>
                                            <p className="font-mono text-xs text-ink-3 mt-0.5">
                                                {quiz.questions.length} questions
                                                {last ? ` · last ${last.score}/${last.total}` : ' · never taken'}
                                            </p>
                                        </div>
                                        <IconBtn
                                            icon="delete"
                                            size={16}
                                            danger
                                            title="Delete quiz"
                                            onClick={e => { e.stopPropagation(); removeQuiz(quiz); }}
                                            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                                        />
                                        <Icon name="chevron_right" size={18} className="text-ink-3 shrink-0" />
                                    </div>
                                );
                            })}
                        </Card>
                    )}
                </div>
            </div>

            {/* pick a note to generate from */}
            <Modal open={picking !== null} onClose={() => { if (!generating) setPicking(null); }} width="max-w-lg">
                <div className="p-5">
                    <h3 className="font-serif text-lg text-ink">
                        {picking === 'quiz' ? 'Make a quiz from a note' : 'Make a deck from a note'}
                    </h3>
                    <p className="text-sm text-ink-2 mt-1">
                        Pick the note to work from — the transcript is used when there is one.
                    </p>
                    <Divider className="my-4" />
                    {generating ? (
                        <div className="flex flex-col items-center gap-3 py-10">
                            <Spinner />
                            <span className="font-mono text-xs text-ink-3">
                                {picking === 'quiz' ? 'Writing questions…' : 'Writing cards…'}
                            </span>
                        </div>
                    ) : pickable.length === 0 ? (
                        <p className="py-8 text-center text-sm text-ink-3">
                            Nothing to work from yet — record a lecture or import a document first.
                        </p>
                    ) : (
                        <div className="max-h-80 overflow-y-auto custom-scrollbar -mx-2">
                            {pickable.map(note => (
                                <button
                                    key={note.id}
                                    onClick={() => pickNote(note)}
                                    className="w-full text-left px-3 py-2.5 rounded-[var(--r)] hover:bg-[var(--card-2)] transition-colors flex items-center gap-3"
                                >
                                    <Icon name="description" size={16} className="text-ink-3 shrink-0" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block font-serif text-sm text-ink truncate">{note.title || 'Untitled'}</span>
                                        <span className="block font-mono text-[10px] text-ink-3 mt-0.5">
                                            {note.type.toLowerCase()} · {note.date}
                                        </span>
                                    </span>
                                    <Icon name="chevron_right" size={16} className="text-ink-3 shrink-0" />
                                </button>
                            ))}
                        </div>
                    )}
                    {genError && !generating && (
                        <p className="mt-3 text-sm text-bad">{genError}</p>
                    )}
                </div>
            </Modal>
        </main>
    );
};

export default StudyView;
