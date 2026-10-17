import { Deck, Flashcard, Quiz, QuizQuestion } from '../types';
import { getAllDecks, saveDeck, getAllQuizzes, saveQuiz } from './storageService';

/* SM-2-style scheduling. Grade: 0 = forgot, 1 = hard, 2 = good, 3 = easy. */
export const gradeCard = (card: Flashcard, grade: 0 | 1 | 2 | 3): Flashcard => {
    const now = new Date();
    let { ease, interval, reps, lapses } = card;

    if (grade === 0) {
        lapses += 1;
        interval = 0; // relearn today
        ease = Math.max(1.3, ease - 0.2);
        return { ...card, ease, interval, reps, lapses, due: now.toISOString() };
    }

    reps += 1;
    const qualityBonus = grade === 3 ? 0.15 : grade === 1 ? -0.15 : 0;
    ease = Math.max(1.3, ease + qualityBonus);

    if (reps === 1) interval = grade === 1 ? 1 : grade === 3 ? 3 : 1;
    else if (reps === 2) interval = grade === 1 ? 2 : grade === 3 ? 7 : 4;
    else interval = Math.max(1, Math.round(interval * ease * (grade === 1 ? 0.8 : grade === 3 ? 1.2 : 1)));

    const due = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);
    return { ...card, ease, interval, reps, lapses, due: due.toISOString() };
};

export const newCard = (front: string, back: string): Flashcard => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    front,
    back,
    ease: 2.5,
    interval: 0,
    due: new Date().toISOString(),
    reps: 0,
    lapses: 0,
});

export const createDeck = async (title: string, cards: { front: string; back: string }[], sourceNoteId?: string): Promise<Deck> => {
    const deck: Deck = {
        id: `deck-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title,
        sourceNoteId,
        createdAt: new Date().toISOString(),
        cards: cards.map(c => newCard(c.front, c.back)),
    };
    await saveDeck(deck);
    return deck;
};

export const dueCards = (deck: Deck): Flashcard[] =>
    deck.cards.filter(c => new Date(c.due).getTime() <= Date.now());

export const totalDue = (decks: Deck[]): number =>
    decks.reduce((n, d) => n + dueCards(d).length, 0);

/* Record a review grade and persist the deck. Returns updated deck. */
export const reviewCard = async (deck: Deck, cardId: string, grade: 0 | 1 | 2 | 3): Promise<Deck> => {
    const updated: Deck = {
        ...deck,
        cards: deck.cards.map(c => c.id === cardId ? gradeCard(c, grade) : c),
    };
    await saveDeck(updated);
    return updated;
};

export const createQuiz = async (title: string, questions: QuizQuestion[], sourceNoteId?: string): Promise<Quiz> => {
    const quiz: Quiz = {
        id: `quiz-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title,
        sourceNoteId,
        createdAt: new Date().toISOString(),
        questions,
        attempts: [],
    };
    await saveQuiz(quiz);
    return quiz;
};

/* Index of the correct option for a quiz answer. The model is asked to copy
   the option verbatim; tolerate trim/case drift and single-letter answers
   ("B") so a generated question is never silently unanswerable. -1 = no match. */
export const correctOptionIndex = (options: string[], answer: string): number => {
    const a = (answer ?? '').trim();
    let i = options.findIndex(o => o === a);
    if (i === -1) i = options.findIndex(o => o.trim() === a);
    if (i === -1) i = options.findIndex(o => o.trim().toLowerCase() === a.toLowerCase());
    if (i === -1 && /^[A-F]$/i.test(a)) {
        const letter = a.toUpperCase().charCodeAt(0) - 65;
        if (letter < options.length) i = letter;
    }
    return i;
};

export const recordQuizAttempt = async (quiz: Quiz, score: number): Promise<Quiz> => {
    const updated: Quiz = {
        ...quiz,
        attempts: [...quiz.attempts, { at: new Date().toISOString(), score, total: quiz.questions.length }],
    };
    await saveQuiz(updated);
    return updated;
};

export { getAllDecks, getAllQuizzes };
