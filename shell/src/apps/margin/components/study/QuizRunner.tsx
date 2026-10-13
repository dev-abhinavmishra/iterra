import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Quiz } from '../../types';
import { Btn, Icon, IconBtn, ProgressBar } from '../ui/primitives';
import { recordQuizAttempt, correctOptionIndex } from '../../services/studyService';

interface QuizRunnerProps {
    quiz: Quiz;
    onExit: (quiz: Quiz) => void;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/* One question at a time: pick → reveal → next. Each completed run is
   persisted as an attempt via recordQuizAttempt. */
const QuizRunner: React.FC<QuizRunnerProps> = ({ quiz: initialQuiz, onExit }) => {
    const [quiz, setQuiz] = useState(initialQuiz);
    const quizRef = useRef(quiz);
    quizRef.current = quiz;

    const total = quiz.questions.length;
    const [idx, setIdx] = useState(0);
    const [picked, setPicked] = useState<number | null>(null);
    const [score, setScore] = useState(0);
    const [finished, setFinished] = useState(total === 0);
    const recorded = useRef(total === 0);
    const advancing = useRef(false);

    const question = quiz.questions[idx];
    const answerIdx = useMemo(
        () => (question ? correctOptionIndex(question.options, question.answer) : -1),
        [question]
    );

    const exit = useCallback(() => onExit(quizRef.current), [onExit]);

    const pick = useCallback((i: number) => {
        if (picked !== null || finished || !question) return;
        setPicked(i);
        if (i === answerIdx) setScore(s => s + 1);
    }, [picked, finished, question, answerIdx]);

    const next = useCallback(async () => {
        if (picked === null || advancing.current) return;
        if (idx + 1 < total) {
            setIdx(i => i + 1);
            setPicked(null);
            return;
        }
        advancing.current = true;
        setFinished(true);
        if (!recorded.current) {
            recorded.current = true;
            try {
                const updated = await recordQuizAttempt(quizRef.current, score);
                setQuiz(updated);
                quizRef.current = updated;
            } catch (e) {
                console.error('Failed to record quiz attempt', e);
            }
        }
        advancing.current = false;
    }, [picked, idx, total, score]);

    const retry = useCallback(() => {
        setIdx(0);
        setPicked(null);
        setScore(0);
        setFinished(false);
        recorded.current = false;
    }, []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement;
            if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
            if (e.key === 'Escape') { e.preventDefault(); exit(); }
            else if (finished) return;
            else if (picked === null && ['1', '2', '3', '4', '5', '6'].includes(e.key)) {
                const i = Number(e.key) - 1;
                if (question && i < question.options.length) { e.preventDefault(); pick(i); }
            } else if (picked !== null && (e.key === 'Enter' || e.key === 'ArrowRight')) {
                e.preventDefault();
                next();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [exit, finished, picked, question, pick, next]);

    /* ---- end screen ---- */
    if (finished) {
        const pct = total > 0 ? Math.round((score / total) * 100) : 0;
        const best = quiz.attempts.length
            ? Math.max(...quiz.attempts.map(a => Math.round((a.score / a.total) * 100)))
            : pct;
        return (
            <div className="flex-1 flex flex-col min-w-0 bg-paper">
                <header className="h-14 shrink-0 border-b border-line flex items-center px-4 gap-3">
                    <IconBtn icon="arrow_back" title="Back to quizzes" onClick={exit} />
                    <span className="font-serif text-lg text-ink truncate">{quiz.title || 'Untitled quiz'}</span>
                </header>
                <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6">
                    <div className="text-center">
                        <p className="font-serif text-5xl text-ink">{score}<span className="text-ink-3">/{total}</span></p>
                        <p className="font-mono text-xs text-ink-3 mt-3">{pct}% · best {Math.max(best, pct)}%</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Btn variant="primary" onClick={retry}>Retry</Btn>
                        <Btn onClick={exit}>Back to quizzes</Btn>
                    </div>
                </div>
            </div>
        );
    }

    if (!question) return null;

    return (
        <div className="flex-1 flex flex-col min-w-0 bg-paper">
            <header className="h-14 shrink-0 border-b border-line flex items-center px-4 gap-3">
                <IconBtn icon="arrow_back" title="Back to quizzes" onClick={exit} />
                <span className="font-serif text-lg text-ink truncate">{quiz.title || 'Untitled quiz'}</span>
                <span className="flex-1" />
                <span className="font-mono text-xs text-ink-3">{idx + 1}/{total}</span>
            </header>

            <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 min-h-0">
                <div className="w-full max-w-2xl flex flex-col gap-5">
                    <ProgressBar value={(idx / total) * 100} />

                    <div key={idx} className="rise">
                        <p className="font-mono text-[11px] text-ink-3 mb-2">question {idx + 1}</p>
                        <h2 className="font-serif text-xl sm:text-2xl leading-snug text-ink">{question.question}</h2>
                    </div>

                    {/* answer sheet — ruled like the back of a card */}
                    <div className="flex flex-col gap-2 sheet-ruled rounded-[var(--r-lg)] px-3 py-2 -mx-3">
                        {question.options.map((opt, i) => {
                            const isCorrect = i === answerIdx;
                            const isPicked = i === picked;
                            let cls = 'border-[var(--line-2)] bg-card text-ink hover:border-[var(--ink-3)] hover:bg-[var(--card-2)]';
                            if (picked !== null) {
                                if (isCorrect) cls = 'border-[var(--ok)]/60 bg-[var(--ok)]/10 text-ink';
                                else if (isPicked) cls = 'border-[var(--bad)]/60 bg-[var(--bad)]/10 text-ink';
                                else cls = 'border-[var(--line)] bg-card text-ink-3 opacity-60';
                            }
                            return (
                                <button
                                    key={i}
                                    onClick={() => pick(i)}
                                    disabled={picked !== null}
                                    className={`w-full text-left px-4 py-3 rounded-[var(--r-lg)] border shadow-card transition-colors duration-150 flex items-center gap-3 ${cls}`}
                                >
                                    <span className="font-mono text-[11px] text-ink-3 w-4 shrink-0">{LETTERS[i]}</span>
                                    <span className="flex-1 text-sm font-sans leading-snug">{opt}</span>
                                    {picked !== null && isCorrect && <Icon name="check" size={16} className="text-ok shrink-0" />}
                                    {picked !== null && isPicked && !isCorrect && <Icon name="close" size={16} className="text-bad shrink-0" />}
                                </button>
                            );
                        })}
                    </div>

                    <div className="h-11 flex items-center justify-between">
                        <span className="font-mono text-xs text-ink-3">
                            {picked === null ? 'pick an answer — keys 1–4' : (idx + 1 === total ? 'enter for results' : 'enter to continue')}
                        </span>
                        {picked !== null && (
                            <Btn variant="primary" size="sm" onClick={next} className="rise">
                                {idx + 1 === total ? 'See results' : 'Next'}
                            </Btn>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default QuizRunner;
