import React, { useEffect, useRef, useState } from 'react';
import { Icon, IconBtn, TextInput, Btn } from '../ui/primitives';

interface FindReplaceProps {
    open: boolean;
    onClose: () => void;
    editorEl: HTMLDivElement | null;
    onChanged: () => void;
}

const unwrapFindMarks = (root: HTMLElement) => {
    root.querySelectorAll('mark[data-find]').forEach(m => {
        const p = m.parentNode;
        if (!p) return;
        while (m.firstChild) p.insertBefore(m.firstChild, m);
        p.removeChild(m);
    });
    root.normalize();
};

const FindReplace: React.FC<FindReplaceProps> = ({ open, onClose, editorEl, onChanged }) => {
    const [query, setQuery] = useState('');
    const [replacement, setReplacement] = useState('');
    const [showReplace, setShowReplace] = useState(false);
    const [count, setCount] = useState(0);
    const [current, setCurrent] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    const marks = (): HTMLElement[] =>
        editorEl ? Array.from(editorEl.querySelectorAll<HTMLElement>('mark[data-find]')) : [];

    const paint = (idx: number) => {
        marks().forEach((m, i) => {
            m.style.background = 'var(--tape)';
            m.style.outline = i === idx ? '2px solid var(--mark)' : 'none';
            m.style.borderRadius = '2px';
        });
    };

    /* Re-scan the editable for matches and wrap them in mark[data-find]. */
    const rescan = (nextQuery: string, preferredIndex = 0) => {
        if (!editorEl) return;
        unwrapFindMarks(editorEl);
        const q = nextQuery.trim().toLowerCase();
        if (!q) {
            setCount(0);
            setCurrent(0);
            onChanged();
            return;
        }
        const walker = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT, {
            acceptNode: (n) => {
                const parent = n.parentElement;
                if (!parent || !n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            },
        });
        const texts: Text[] = [];
        while (walker.nextNode()) texts.push(walker.currentNode as Text);

        let total = 0;
        for (const t of texts) {
            const data = t.data;
            const lower = data.toLowerCase();
            let idx = lower.indexOf(q);
            let node: Text | null = t;
            while (node && idx !== -1) {
                const range = document.createRange();
                range.setStart(node, idx);
                range.setEnd(node, idx + q.length);
                const mark = document.createElement('mark');
                mark.setAttribute('data-find', '1');
                try {
                    range.surroundContents(mark);
                    total++;
                } catch { /* skip */ }
                // continue searching after the new mark inside the remainder
                const rest = mark.nextSibling;
                if (rest && rest.nodeType === 3) {
                    node = rest as Text;
                    idx = (node.nodeValue || '').toLowerCase().indexOf(q);
                } else {
                    node = null;
                }
            }
        }
        setCount(total);
        const idx = total === 0 ? 0 : Math.min(preferredIndex, total - 1);
        setCurrent(idx);
        paint(idx);
        if (total > 0) marks()[idx]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        onChanged();
    };

    useEffect(() => {
        if (open) {
            setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            }, 30);
            rescan(query);
        } else if (editorEl) {
            unwrapFindMarks(editorEl);
            setCount(0);
            setCurrent(0);
            onChanged();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => () => {
        if (editorEl) unwrapFindMarks(editorEl);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const goto = (dir: 1 | -1) => {
        if (!count) return;
        const next = (current + dir + count) % count;
        setCurrent(next);
        paint(next);
        marks()[next]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };

    const replaceOne = () => {
        const list = marks();
        if (!count || !list[current]) return;
        list[current].textContent = replacement;
        rescan(query, current);
    };

    const replaceAll = () => {
        marks().forEach(m => { m.textContent = replacement; });
        rescan(query, 0);
    };

    const close = () => {
        if (editorEl) unwrapFindMarks(editorEl);
        onChanged();
        onClose();
    };

    if (!open) return null;

    return (
        <div className="absolute top-2 right-3 z-30 bg-card border border-line-2 rounded-[var(--r)] shadow-pop pop-in p-2 w-[300px]">
            <div className="flex items-center gap-1">
                <Icon name="search" size={15} className="text-ink-3 ml-1" />
                <TextInput
                    ref={inputRef}
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); rescan(e.target.value); }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') goto(e.shiftKey ? -1 : 1);
                        if (e.key === 'Escape') close();
                    }}
                    placeholder="Find in note"
                    className="h-8 text-[13px] border-transparent bg-transparent focus:border-transparent px-1.5"
                />
                <span className="font-mono text-[10px] text-ink-3 w-9 text-center shrink-0 select-none">
                    {count ? `${current + 1}/${count}` : '0/0'}
                </span>
                <IconBtn icon="keyboard_arrow_up" size={16} title="Previous match" onClick={() => goto(-1)} disabled={!count} />
                <IconBtn icon="keyboard_arrow_down" size={16} title="Next match" onClick={() => goto(1)} disabled={!count} />
                <IconBtn
                    icon="find_replace"
                    size={16}
                    title="Replace"
                    active={showReplace}
                    onClick={() => setShowReplace(v => !v)}
                />
                <IconBtn icon="close" size={16} title="Close (Esc)" onClick={close} />
            </div>
            {showReplace && (
                <div className="flex items-center gap-1.5 mt-1.5 pl-6">
                    <TextInput
                        value={replacement}
                        onChange={(e) => setReplacement(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') replaceOne();
                            if (e.key === 'Escape') close();
                        }}
                        placeholder="Replace with"
                        className="h-8 text-[13px]"
                    />
                    <Btn size="sm" onClick={replaceOne} disabled={!count}>Replace</Btn>
                    <Btn size="sm" variant="ghost" onClick={replaceAll} disabled={!count}>All</Btn>
                </div>
            )}
        </div>
    );
};

export { unwrapFindMarks };
export default FindReplace;
