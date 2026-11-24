import React, { useEffect, useState } from 'react';
import { GeneratedSource, QuizQuestion } from '../../types';
import { Btn, Divider, Icon, IconBtn, Modal } from '../ui/primitives';
import { correctOptionIndex } from '../../services/studyService';
import { GeneratedCardItem } from '../../services/generatedStudy';

/* Editable review step for AI-generated study material. Everything shown
   here is a draft — nothing reaches a deck/quiz (or the canonical store)
   until onConfirm hands the kept items back to the caller. Discarded rows
   are dropped from local state only. */

interface CommonProps {
    open: boolean;
    onClose: () => void;
    /** Provenance line shown under the heading, e.g. 'AI-generated · from "Lecture 3"'. */
    sourceLabel?: string;
}

export interface DeckReviewProps extends CommonProps {
    kind: 'deck';
    items: GeneratedCardItem[];
    onConfirm: (cards: GeneratedCardItem[]) => void;
}

export interface QuizReviewProps extends CommonProps {
    kind: 'quiz';
    items: QuizQuestion[];
    onConfirm: (questions: QuizQuestion[]) => void;
}

type Props = DeckReviewProps | QuizReviewProps;

const SourceNote: React.FC<{ source?: GeneratedSource }> = ({ source }) => {
    if (!source) return null;
    return (
        <p className="flex items-start gap-1.5 text-[11px] text-ink-3 leading-snug mt-1">
            <Icon name="format_quote" size={12} className="mt-0.5 shrink-0" />
            <span>
                <span className="font-mono">AI · </span>
                {source.excerpt ?? source.label}
            </span>
        </p>
    );
};

const inputCls = 'w-full h-8 px-2 rounded-[var(--r)] bg-[var(--card-2)] border border-[var(--line-2)] text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:border-[var(--mark)] transition-colors';

const GeneratedReviewModal: React.FC<Props> = (props) => {
    const { open, onClose, sourceLabel } = props;
    const [cards, setCards] = useState<GeneratedCardItem[]>([]);
    const [questions, setQuestions] = useState<QuizQuestion[]>([]);

    /* Re-seed the draft each time the modal opens — a cancelled review must
       not leak edits into the next generation. */
    useEffect(() => {
        if (!open) return;
        if (props.kind === 'deck') setCards(props.items.map(c => ({ ...c })));
        else setQuestions(props.items.map(q => ({ ...q, options: [...q.options] })));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const isDeck = props.kind === 'deck';
    const total = isDeck ? cards.length : questions.length;

    const keptCards = (): GeneratedCardItem[] =>
        cards.filter(c => c.front.trim() && c.back.trim())
            .map(c => ({ ...c, front: c.front.trim(), back: c.back.trim() }));

    const keptQuestions = (): QuizQuestion[] =>
        questions
            .map(q => ({
                ...q,
                question: q.question.trim(),
                options: q.options.map(o => o.trim()).filter(o => o.length > 0),
            }))
            .filter(q => q.question.length > 0 && q.options.length >= 2
                && correctOptionIndex(q.options, q.answer) !== -1)
            .map(q => ({ ...q, answer: q.options[correctOptionIndex(q.options, q.answer)] }));

    const kept = isDeck ? keptCards().length : keptQuestions().length;

    const confirm = () => {
        if (isDeck) (props as DeckReviewProps).onConfirm(keptCards());
        else (props as QuizReviewProps).onConfirm(keptQuestions());
    };

    const setCard = (i: number, patch: Partial<GeneratedCardItem>) =>
        setCards(cs => cs.map((c, j) => j === i ? { ...c, ...patch } : c));

    const setQuestion = (i: number, patch: Partial<QuizQuestion>) =>
        setQuestions(qs => qs.map((q, j) => j === i ? { ...q, ...patch } : q));

    const setOption = (qi: number, oi: number, value: string) =>
        setQuestions(qs => qs.map((q, j) => j === qi
            ? { ...q, options: q.options.map((o, k) => k === oi ? value : o) }
            : q));

    return (
        <Modal open={open} onClose={onClose} width="max-w-2xl">
            <div className="p-5 flex flex-col max-h-[80vh]">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="font-serif text-lg text-ink">
                            {isDeck ? 'Review generated cards' : 'Review generated questions'}
                        </h3>
                        <p className="font-mono text-[10px] text-ink-3 mt-1">
                            AI-generated — edit or discard before anything is saved
                            {sourceLabel ? ` · ${sourceLabel}` : ''}
                        </p>
                    </div>
                    <IconBtn icon="close" title="Close" onClick={onClose} />
                </div>
                <Divider className="my-4" />

                <div className="flex-1 overflow-y-auto custom-scrollbar -mx-1 px-1 space-y-3">
                    {isDeck ? (
                        cards.map((c, i) => (
                            <div key={i} className="rounded-[var(--r)] border border-[var(--line)] bg-[var(--card-2)]/40 p-3">
                                <div className="flex items-start gap-2">
                                    <span className="font-mono text-[10px] text-ink-3 mt-2 w-5 shrink-0">{String(i + 1).padStart(2, '0')}</span>
                                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
                                        <input
                                            value={c.front}
                                            onChange={e => setCard(i, { front: e.target.value })}
                                            placeholder="Front"
                                            aria-label={`Card ${i + 1} front`}
                                            className={`${inputCls} font-serif`}
                                        />
                                        <input
                                            value={c.back}
                                            onChange={e => setCard(i, { back: e.target.value })}
                                            placeholder="Back"
                                            aria-label={`Card ${i + 1} back`}
                                            className={inputCls}
                                        />
                                    </div>
                                    <IconBtn
                                        icon="delete"
                                        size={15}
                                        danger
                                        title="Discard card"
                                        onClick={() => setCards(cs => cs.filter((_, j) => j !== i))}
                                    />
                                </div>
                                <div className="pl-7"><SourceNote source={c.source} /></div>
                            </div>
                        ))
                    ) : (
                        questions.map((q, i) => {
                            const answerIdx = correctOptionIndex(q.options, q.answer);
                            return (
                                <div key={i} className="rounded-[var(--r)] border border-[var(--line)] bg-[var(--card-2)]/40 p-3">
                                    <div className="flex items-start gap-2">
                                        <span className="font-mono text-[10px] text-ink-3 mt-2 w-5 shrink-0">{String(i + 1).padStart(2, '0')}</span>
                                        <div className="flex-1 min-w-0 space-y-2">
                                            <input
                                                value={q.question}
                                                onChange={e => setQuestion(i, { question: e.target.value })}
                                                placeholder="Question"
                                                aria-label={`Question ${i + 1}`}
                                                className={`${inputCls} font-serif`}
                                            />
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                {q.options.map((opt, oi) => (
                                                    <input
                                                        key={oi}
                                                        value={opt}
                                                        onChange={e => setOption(i, oi, e.target.value)}
                                                        placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                                                        aria-label={`Question ${i + 1} option ${String.fromCharCode(65 + oi)}`}
                                                        className={inputCls}
                                                    />
                                                ))}
                                            </div>
                                            <select
                                                value={answerIdx === -1 ? '__none' : String(answerIdx)}
                                                onChange={e => {
                                                    const oi = Number(e.target.value);
                                                    if (oi >= 0 && oi < q.options.length) {
                                                        setQuestion(i, { answer: q.options[oi] });
                                                    }
                                                }}
                                                aria-label={`Question ${i + 1} correct answer`}
                                                className={`${inputCls} h-8 text-[13px]`}
                                            >
                                                {answerIdx === -1 && <option value="__none">Pick the correct option…</option>}
                                                {q.options.map((opt, oi) => (
                                                    <option key={oi} value={oi}>
                                                        {String.fromCharCode(65 + oi)}. {opt || '(empty)'}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <IconBtn
                                            icon="delete"
                                            size={15}
                                            danger
                                            title="Discard question"
                                            onClick={() => setQuestions(qs => qs.filter((_, j) => j !== i))}
                                        />
                                    </div>
                                    <div className="pl-7"><SourceNote source={q.source} /></div>
                                </div>
                            );
                        })
                    )}
                    {total === 0 && (
                        <p className="py-8 text-center text-sm text-ink-3">
                            Everything was discarded — close this to start over.
                        </p>
                    )}
                </div>

                <Divider className="my-4" />
                <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-[10px] text-ink-3">
                        {kept} of {total} kept
                    </span>
                    <div className="flex items-center gap-2">
                        <Btn size="sm" variant="ghost" onClick={onClose}>Cancel</Btn>
                        <Btn
                            size="sm"
                            variant="primary"
                            onClick={confirm}
                            disabled={kept === 0}
                            icon="bookmark_add"
                        >
                            {isDeck
                                ? `Add ${kept} card${kept === 1 ? '' : 's'} to deck`
                                : `Add ${kept} question${kept === 1 ? '' : 's'} to quiz`}
                        </Btn>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default GeneratedReviewModal;
