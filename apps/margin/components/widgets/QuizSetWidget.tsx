import React, { useState } from 'react';
import { Btn, Icon } from '../ui/primitives';
import { createQuiz, correctOptionIndex } from '../../services/studyService';
import { sanitizeHtml } from '../../services/sanitize';
import { QuizQuestion } from '../../types';

interface QuizSetWidgetProps {
    data: any;
}

/* Index-card quiz: paper option buttons with letter keys. Selecting an option
   flips the card to reveal correct/incorrect after "Check answers". */
const QuizSetWidget: React.FC<QuizSetWidgetProps> = ({ data }) => {
    const questions: QuizQuestion[] = data.questions || (Array.isArray(data) ? data : []);
    const [selected, setSelected] = useState<Record<number, number>>({});
    const [checked, setChecked] = useState(false);
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);

    const answered = Object.keys(selected).length;
    const score = questions.reduce(
        (n, q, i) => n + (selected[i] !== undefined && selected[i] === correctOptionIndex(q.options, q.answer) ? 1 : 0),
        0
    );

    const handleSelect = (qi: number, oi: number) => {
        if (checked) return;
        setSelected(prev => ({ ...prev, [qi]: oi }));
    };

    const handleSave = async () => {
        if (saved || saving || questions.length === 0) return;
        setSaving(true);
        try {
            await createQuiz(data.title || 'Quiz from Ask', questions);
            setSaved(true);
        } catch (e) {
            console.error('Save quiz failed', e);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-card border border-line rounded-[var(--r-lg)] shadow-card max-w-2xl mx-auto overflow-hidden">
            {/* Card header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
                <div className="min-w-0">
                    <h4 className="font-serif text-base text-ink truncate">{data.title || 'Quiz'}</h4>
                    <p className="font-mono text-[10px] text-ink-3 mt-0.5">{questions.length} questions</p>
                </div>
                <Icon name="quiz" size={18} className="text-ink-3" />
            </div>

            {/* Questions */}
            <div className="px-5 py-4 space-y-6">
                {questions.map((q, qi) => (
                    <div key={qi}>
                        <div className="flex gap-3 mb-2.5">
                            <span className="font-mono text-[10px] text-ink-3 mt-1 shrink-0 w-5">{String(qi + 1).padStart(2, '0')}</span>
                            <p className="text-sm font-medium text-ink leading-relaxed" dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question) }} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-8">
                            {q.options?.map((opt, oi) => {
                                const isSel = selected[qi] === oi;
                                const isCorrect = oi === correctOptionIndex(q.options, q.answer);
                                let cls = 'border-line-2 bg-card-2 text-ink-2 hover:border-[var(--ink-3)] hover:text-ink';
                                if (checked) {
                                    if (isCorrect) cls = 'border-[var(--ok)]/60 bg-[var(--ok)]/10 text-ink';
                                    else if (isSel) cls = 'border-[var(--bad)]/60 bg-[var(--bad)]/10 text-ink';
                                    else cls = 'border-line bg-card-2 text-ink-3 opacity-60';
                                } else if (isSel) {
                                    cls = 'border-[var(--mark)] bg-[var(--mark-soft)] text-ink';
                                }
                                return (
                                    <button
                                        key={oi}
                                        onClick={() => handleSelect(qi, oi)}
                                        className={`flex items-center gap-2.5 text-left px-3 py-2.5 rounded-[var(--r)] border text-[13px] transition-colors duration-150 ${cls}`}
                                    >
                                        <span className={`w-5 h-5 rounded border flex items-center justify-center font-mono text-[10px] shrink-0
                                            ${isSel && !checked ? 'bg-[var(--mark)] text-[var(--mark-ink)] border-transparent'
                                                : checked && isCorrect ? 'border-[var(--ok)]/60 text-ok'
                                                : 'border-[var(--line-2)] text-ink-3'}`}>
                                            {String.fromCharCode(65 + oi)}
                                        </span>
                                        <span className="leading-snug" dangerouslySetInnerHTML={{ __html: sanitizeHtml(opt) }} />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-line bg-card-2/40">
                <span className="font-mono text-[10px] text-ink-3">
                    {checked ? `score ${score}/${questions.length}` : `${answered} of ${questions.length} answered`}
                </span>
                <div className="flex items-center gap-2">
                    {!checked ? (
                        <Btn size="sm" variant="primary" onClick={() => setChecked(true)} disabled={answered === 0}>
                            Check answers
                        </Btn>
                    ) : (
                        <Btn size="sm" variant="ghost" onClick={() => { setChecked(false); setSelected({}); }}>
                            Try again
                        </Btn>
                    )}
                    <Btn
                        size="sm"
                        onClick={handleSave}
                        disabled={saved || saving || questions.length === 0}
                        icon={saved ? 'check' : 'bookmark_add'}
                    >
                        {saved ? 'Saved to Study' : saving ? 'Saving…' : 'Save to Study'}
                    </Btn>
                </div>
            </div>
        </div>
    );
};

export default QuizSetWidget;
