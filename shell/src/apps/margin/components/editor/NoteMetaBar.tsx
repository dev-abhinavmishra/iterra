import React from 'react';
import { shortDate, showDuration } from '../../services/format';

interface NoteMetaBarProps {
    date: string;
    duration?: string;
    words: number;
    saveState: 'saved' | 'saving';
}

const Dot = () => <span className="text-ink-3 select-none">·</span>;

const NoteMetaBar: React.FC<NoteMetaBarProps> = ({ date, duration, words, saveState }) => {
    const readMin = Math.max(1, Math.ceil(words / 200));
    const dur = showDuration(duration);
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
        </div>
    );
};

export default NoteMetaBar;
