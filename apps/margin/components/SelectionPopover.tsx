import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { runAction, parseJsonArray } from '../services/aiService';
import { createDeck } from '../services/studyService';
import { Icon, Spinner } from './ui/primitives';

interface SelectionPopoverProps {
    onAddToChat: (text: string) => void;
}

type Mode = 'idle' | 'busy' | 'saved' | 'copied' | 'error';

interface PopState {
    visible: boolean;
    top: number;
    left: number;
    below: boolean;
    text: string;
}

const HIDDEN: PopState = { visible: false, top: 0, left: 0, below: false, text: '' };

const SelectionPopover: React.FC<SelectionPopoverProps> = ({ onAddToChat }) => {
    const [pop, setPop] = useState<PopState>(HIDDEN);
    const [mode, setMode] = useState<Mode>('idle');
    const selecting = useRef(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const hide = useCallback(() => {
        setPop(HIDDEN);
        setMode('idle');
        if (timer.current) clearTimeout(timer.current);
    }, []);

    const flash = useCallback((m: Mode, thenHide: boolean) => {
        setMode(m);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(thenHide ? hide : () => setMode('idle'), 1400);
    }, [hide]);

    const update = useCallback(() => {
        if (selecting.current) return;
        const sel = window.getSelection();
        const text = sel?.toString().trim() || '';
        if (!sel || sel.isCollapsed || !text || sel.rangeCount === 0) {
            if (mode === 'idle') hide();
            return;
        }
        const anchor = sel.anchorNode;
        const el = anchor instanceof Element ? anchor : anchor?.parentElement;
        // Never pop over editable surfaces (the editor owns its own toolbar).
        if (!el || el.closest('input, textarea, [contenteditable="true"], [data-selection-popover]')) {
            if (mode === 'idle') hide();
            return;
        }
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        const center = Math.min(Math.max(rect.left + rect.width / 2, 120), window.innerWidth - 120);
        const below = rect.top < 56; // not enough room above — flip under the selection
        setPop({
            visible: true,
            top: below ? rect.bottom + 8 : rect.top - 8,
            left: center,
            below,
            text,
        });
    }, [hide, mode]);

    useEffect(() => {
        const onDown = () => { selecting.current = true; };
        const onUp = () => { selecting.current = false; update(); };
        const onScroll = () => { if (mode === 'idle') hide(); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };

        document.addEventListener('selectionchange', update);
        document.addEventListener('mousedown', onDown);
        document.addEventListener('mouseup', onUp);
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onScroll);
        window.addEventListener('blur', onScroll);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('selectionchange', update);
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('mouseup', onUp);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onScroll);
            window.removeEventListener('blur', onScroll);
            document.removeEventListener('keydown', onKey);
        };
    }, [update, hide, mode]);

    const doAsk = () => {
        onAddToChat(pop.text);
        window.getSelection()?.removeAllRanges();
        hide();
    };

    const doCopy = async () => {
        try {
            await navigator.clipboard.writeText(pop.text);
            flash('copied', true);
        } catch {
            flash('error', false);
        }
    };

    const doCards = async () => {
        setMode('busy');
        try {
            const res = await runAction('flashcards', pop.text);
            const cards = parseJsonArray<{ front?: string; back?: string }>(res.content)
                .filter(c => c && typeof c.front === 'string' && typeof c.back === 'string')
                .map(c => ({ front: c.front as string, back: c.back as string }));
            if (cards.length === 0) {
                flash('error', false);
                return;
            }
            await createDeck('From selection', cards);
            flash('saved', true);
            window.getSelection()?.removeAllRanges();
        } catch {
            flash('error', false);
        }
    };

    const itemCls = `flex items-center gap-1 px-2 h-7 rounded-[6px] text-xs font-sans font-medium text-ink-2
        hover:text-ink hover:bg-[var(--card-2)] transition-colors disabled:opacity-40 disabled:pointer-events-none`;

    return (
        <AnimatePresence>
            {pop.visible && (
                <motion.div
                    data-selection-popover
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.13, ease: 'easeOut' }}
                    className="fixed z-[80]"
                    style={{
                        top: pop.top,
                        left: pop.left,
                        transform: pop.below ? 'translateX(-50%)' : 'translate(-50%, -100%)',
                    }}
                    onMouseDown={e => e.preventDefault() /* keep the text selection alive */}
                >
                    <div className="flex items-center h-9 px-1 bg-card border border-line-2 rounded-[var(--r)] shadow-pop">
                        {mode === 'idle' || mode === 'busy' ? (
                            <>
                                <button className={itemCls} onClick={doAsk} disabled={mode === 'busy'}>
                                    <Icon name="forum" size={14} className="text-mark" />
                                    Ask
                                </button>
                                <span className="w-px h-4 bg-[var(--line)]" />
                                <button className={itemCls} onClick={doCards} disabled={mode === 'busy'}>
                                    {mode === 'busy'
                                        ? <Spinner size={12} />
                                        : <Icon name="style" size={14} className="text-ink-3" />}
                                    Cards
                                </button>
                                <span className="w-px h-4 bg-[var(--line)]" />
                                <button className={itemCls} onClick={doCopy} disabled={mode === 'busy'}>
                                    <Icon name="content_copy" size={14} className="text-ink-3" />
                                    Copy
                                </button>
                            </>
                        ) : (
                            <span className="flex items-center gap-1.5 px-2.5 h-7">
                                <Icon
                                    name={mode === 'error' ? 'close' : 'check'}
                                    size={14}
                                    className={mode === 'error' ? 'text-bad' : 'text-ok'}
                                />
                                <span className="font-mono text-[11px] text-ink-2">
                                    {mode === 'saved' ? 'Deck saved' : mode === 'copied' ? 'Copied' : 'Couldn’t make cards'}
                                </span>
                            </span>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default SelectionPopover;
