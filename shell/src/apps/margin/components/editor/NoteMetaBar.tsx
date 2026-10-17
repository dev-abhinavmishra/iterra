import React, { useState } from 'react';
import { shortDate, showDuration } from '../../services/format';
import { Icon } from '../ui/primitives';

interface NoteMetaBarProps {
    date: string;
    duration?: string;
    words: number;
    saveState: 'saved' | 'saving';
    course?: string;
    courseId?: string;
    onCourseChange?: (courseId: string | undefined, course: string | undefined) => void;
}

const Dot = () => <span className="text-ink-3 select-none">·</span>;

const NoteMetaBar: React.FC<NoteMetaBarProps> = ({ date, duration, words, saveState, course, courseId, onCourseChange }) => {
    const readMin = Math.max(1, Math.ceil(words / 200));
    const dur = showDuration(duration);
    const [open, setOpen] = useState(false);
    const [choices, setChoices] = useState<{ key: string; code: string; name: string }[] | null>(null);

    const openMenu = async () => {
        setOpen(true);
        if (choices !== null) return;
        try {
            const list = (await (window as any).iterra?.courses?.list?.()) ?? [];
            setChoices(
                list.map((c: any) => ({
                    key: c.key,
                    code: c.course || c.data?.code || c.title || 'course',
                    name: c.title || '',
                })).filter((c: { key?: string }) => c.key),
            );
        } catch {
            setChoices([]);
        }
    };

    return (
        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 font-hand text-[17px] text-ink-3 mt-1.5">
            <span>{shortDate(date)}</span>
            {dur && (
                <>
                    <Dot />
                    <span>{dur}</span>
                </>
            )}
            <Dot />
            <span>{words.toLocaleString()} {words === 1 ? 'word' : 'words'}</span>
            {words > 0 && (
                <>
                    <Dot />
                    <span>{readMin} min read</span>
                </>
            )}
            <Dot />
            <span className={saveState === 'saving' ? 'text-warn' : 'text-ok'}>
                {saveState === 'saving' ? 'Saving…' : 'Saved'}
            </span>
            {onCourseChange && (
                <>
                    <Dot />
                    <span className="relative">
                        <button
                            type="button"
                            onClick={openMenu}
                            title={course ? `Filed under ${course} — click to change` : 'File this note under a course'}
                            className={`inline-flex items-center gap-1 rounded-[var(--r-sm)] px-1 -mx-1 transition-colors hover:text-ink hover:bg-[var(--card-2)] ${course ? 'text-ink-2' : 'text-ink-3/70'}`}
                        >
                            <Icon name="school" size={14} />
                            {course ?? 'no course'}
                        </button>
                        {open && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                                <div className="absolute left-0 top-full mt-1 z-50 w-56 bg-card border border-line-2 rounded-[var(--r)] shadow-pop pop-in py-1 font-sans">
                                    {choices === null ? (
                                        <div className="px-3 py-2 text-[13px] text-ink-3">loading…</div>
                                    ) : (
                                        <>
                                            {courseId && (
                                                <button
                                                    type="button"
                                                    onClick={() => { onCourseChange(undefined, undefined); setOpen(false); }}
                                                    className="w-full h-8 px-3 text-left text-[13px] text-ink-3 hover:text-ink hover:bg-[var(--card-2)] transition-colors"
                                                >
                                                    no course
                                                </button>
                                            )}
                                            {choices.length === 0 && !courseId ? (
                                                <div className="px-3 py-2 text-[13px] text-ink-3">no courses yet — add them in Planning</div>
                                            ) : (
                                                choices.map(c => (
                                                    <button
                                                        key={c.key}
                                                        type="button"
                                                        onClick={() => { onCourseChange(c.key, c.code); setOpen(false); }}
                                                        className="w-full h-8 px-3 flex items-baseline gap-2 text-left hover:bg-[var(--card-2)] transition-colors"
                                                    >
                                                        <span className="text-[13px] text-ink">{c.code}</span>
                                                        <span className="text-[12px] text-ink-3 truncate">{c.name}</span>
                                                    </button>
                                                ))
                                            )}
                                        </>
                                    )}
                                </div>
                            </>
                        )}
                    </span>
                </>
            )}
        </div>
    );
};

export default NoteMetaBar;
