import React, { useEffect, useRef, useState } from 'react';
import { Icon, Spinner } from '../ui/primitives';

export type InlineAIAction = 'summarize' | 'expand' | 'simplify';

interface FloatingToolbarProps {
    editorEl: HTMLDivElement | null;
    onCommand: (cmd: string) => void;
    onMark: () => void;
    onAI: (action: InlineAIAction) => Promise<void>;
}

const BTN = 'h-7 px-1.5 inline-flex items-center justify-center rounded-[var(--r)] text-ink-3 hover:text-ink hover:bg-[var(--card-2)] transition-colors duration-150';
const AI_BTN = 'h-7 px-2 inline-flex items-center rounded-[var(--r)] font-sans text-xs font-medium text-ink-2 hover:text-ink hover:bg-[var(--card-2)] transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none';

const FloatingToolbar: React.FC<FloatingToolbarProps> = ({ editorEl, onCommand, onMark, onAI }) => {
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const [busy, setBusy] = useState(false);
    const rangeRef = useRef<Range | null>(null);

    const update = () => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount || !editorEl) {
            setPos(null);
            return;
        }
        const range = sel.getRangeAt(0);
        if (!editorEl.contains(range.commonAncestorContainer) || !range.toString().trim()) {
            setPos(null);
            return;
        }
        rangeRef.current = range.cloneRange();
        const rect = range.getBoundingClientRect();
        setPos({
            top: Math.max(8, rect.top - 10),
            left: Math.min(window.innerWidth - 120, Math.max(120, rect.left + rect.width / 2)),
        });
    };

    useEffect(() => {
        let raf = 0;
        const onChange = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(update);
        };
        const onBlur = (e: FocusEvent) => {
            // Hide when the selection moves outside the editor (e.g. into the find bar)
            if (e.target && editorEl && !editorEl.contains(e.target as Node)) setPos(null);
        };
        document.addEventListener('selectionchange', onChange);
        window.addEventListener('scroll', onChange, true);
        window.addEventListener('resize', onChange);
        document.addEventListener('focusin', onBlur);
        return () => {
            cancelAnimationFrame(raf);
            document.removeEventListener('selectionchange', onChange);
            window.removeEventListener('scroll', onChange, true);
            window.removeEventListener('resize', onChange);
            document.removeEventListener('focusin', onBlur);
        };
    }, [editorEl]);

    if (!pos) return null;

    const run = async (action: InlineAIAction) => {
        setBusy(true);
        try {
            await onAI(action);
        } finally {
            setBusy(false);
            setPos(null);
        }
    };

    return (
        <div
            className="fixed z-40 flex items-center gap-0.5 px-1 py-1 bg-card border border-line-2 rounded-[var(--r)] shadow-pop pop-in"
            style={{ top: pos.top, left: pos.left, transform: 'translate(-50%, -100%)' }}
            onMouseDown={(e) => e.preventDefault()}
        >
            {busy ? (
                <div className="flex items-center gap-2 px-2 h-7">
                    <Spinner size={12} />
                    <span className="font-sans text-xs text-ink-3">Working…</span>
                </div>
            ) : (
                <>
                    <button type="button" className={BTN} title="Bold" onClick={() => onCommand('bold')}>
                        <Icon name="format_bold" size={16} />
                    </button>
                    <button type="button" className={BTN} title="Italic" onClick={() => onCommand('italic')}>
                        <Icon name="format_italic" size={16} />
                    </button>
                    <button type="button" className={BTN} title="Underline" onClick={() => onCommand('underline')}>
                        <Icon name="format_underlined" size={16} />
                    </button>
                    <button type="button" className={BTN} title="Highlight" onClick={onMark}>
                        <Icon name="ink_highlighter" size={16} />
                    </button>
                    <div className="w-px h-4 bg-[var(--line)] mx-1" />
                    <button type="button" className={AI_BTN} disabled={busy} onClick={() => run('summarize')}>Summarize</button>
                    <button type="button" className={AI_BTN} disabled={busy} onClick={() => run('expand')}>Expand</button>
                    <button type="button" className={AI_BTN} disabled={busy} onClick={() => run('simplify')}>Simplify</button>
                </>
            )}
        </div>
    );
};

export default FloatingToolbar;
