import React, { useRef, useState } from 'react';
import { Icon, TextInput, Btn } from '../ui/primitives';

export interface FormatState {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strike: boolean;
    block: string; // current formatBlock value, e.g. 'h1', 'p', 'blockquote', 'pre'
}

interface FormatToolbarProps {
    state: FormatState;
    onCommand: (cmd: string, value?: string) => void;
    onMark: () => void;
    onInsertTable: () => void;
    onOpenLink: () => void;
    onInsertLink: (url: string) => void;
    onClear: () => void;
    focusMode: boolean;
    onToggleFocus: () => void;
}

/* mousedown must be prevented so the editor selection survives the click. */
const TBtn: React.FC<{
    icon?: string;
    label?: string;
    title: string;
    active?: boolean;
    onPress: () => void;
}> = ({ icon, label, title, active, onPress }) => (
    <button
        type="button"
        title={title}
        aria-pressed={active || undefined}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onPress}
        className={`h-8 min-w-8 px-1.5 inline-flex items-center justify-center rounded-[var(--r)] transition-colors duration-150 shrink-0
            ${active ? 'text-[var(--mark)] bg-[var(--mark-soft)]' : 'text-ink-3 hover:text-ink hover:bg-[var(--card-2)]'}`}
    >
        {icon ? <Icon name={icon} size={17} /> : <span className="font-sans text-[11px] font-semibold">{label}</span>}
    </button>
);

const Sep = () => <div className="w-px h-4 bg-[var(--line)] mx-1 shrink-0" />;

const BLOCK_LABELS: { value: string; label: string; title: string }[] = [
    { value: 'h1', label: 'H1', title: 'Heading 1' },
    { value: 'h2', label: 'H2', title: 'Heading 2' },
    { value: 'h3', label: 'H3', title: 'Heading 3' },
    { value: 'p', label: 'P', title: 'Paragraph' },
];

const FormatToolbar: React.FC<FormatToolbarProps> = ({
    state, onCommand, onMark, onInsertTable, onOpenLink, onInsertLink, onClear, focusMode, onToggleFocus,
}) => {
    const [linkOpen, setLinkOpen] = useState(false);
    const [url, setUrl] = useState('');
    const linkBtnRef = useRef<HTMLDivElement>(null);

    const applyLink = () => {
        const u = url.trim();
        if (u) onInsertLink(/^https?:\/\//i.test(u) ? u : `https://${u}`);
        setLinkOpen(false);
        setUrl('');
    };

    // The toolbar row scrolls horizontally (overflow-x-auto clips absolutely
    // positioned children) — anchor the link form to the viewport instead.
    const anchor = linkOpen && linkBtnRef.current ? linkBtnRef.current.getBoundingClientRect() : null;

    return (
        <div className="h-10 shrink-0 border-b border-line bg-paper flex items-center px-2.5 gap-0.5 overflow-x-auto custom-scrollbar relative z-20">
            <TBtn icon="undo" title="Undo" onPress={() => onCommand('undo')} />
            <TBtn icon="redo" title="Redo" onPress={() => onCommand('redo')} />
            <Sep />
            <TBtn icon="format_bold" title="Bold" active={state.bold} onPress={() => onCommand('bold')} />
            <TBtn icon="format_italic" title="Italic" active={state.italic} onPress={() => onCommand('italic')} />
            <TBtn icon="format_underlined" title="Underline" active={state.underline} onPress={() => onCommand('underline')} />
            <TBtn icon="strikethrough_s" title="Strikethrough" active={state.strike} onPress={() => onCommand('strikeThrough')} />
            <TBtn icon="ink_highlighter" title="Highlight" onPress={onMark} />
            <Sep />
            {BLOCK_LABELS.map(b => (
                <TBtn
                    key={b.value}
                    label={b.label}
                    title={b.title}
                    active={state.block === b.value}
                    onPress={() => onCommand('formatBlock', b.value)}
                />
            ))}
            <Sep />
            <TBtn icon="format_list_bulleted" title="Bullet list" onPress={() => onCommand('insertUnorderedList')} />
            <TBtn icon="format_list_numbered" title="Numbered list" onPress={() => onCommand('insertOrderedList')} />
            <TBtn icon="format_quote" title="Quote" active={state.block === 'blockquote'} onPress={() => onCommand('formatBlock', 'blockquote')} />
            <TBtn icon="code" title="Code block" active={state.block === 'pre'} onPress={() => onCommand('formatBlock', 'pre')} />
            <Sep />
            <TBtn icon="table" title="Insert table" onPress={onInsertTable} />
            <div className="relative shrink-0" ref={linkBtnRef}>
                <TBtn
                    icon="link"
                    title="Insert link"
                    onPress={() => {
                        if (linkOpen) { setLinkOpen(false); return; }
                        onOpenLink();
                        setLinkOpen(true);
                    }}
                />
            </div>
            {anchor && (
                    <div
                        className="fixed z-50 w-64 bg-card border border-line-2 rounded-[var(--r)] shadow-pop pop-in p-2 flex items-center gap-1.5"
                        style={{ top: anchor.bottom + 6, left: Math.max(8, Math.min(anchor.left, window.innerWidth - 272)) }}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <TextInput
                            autoFocus
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') applyLink();
                                if (e.key === 'Escape') setLinkOpen(false);
                            }}
                            placeholder="Paste a link"
                            className="h-8 text-[13px]"
                        />
                        <Btn size="sm" variant="primary" onClick={applyLink}>Apply</Btn>
                    </div>
            )}
            <TBtn icon="horizontal_rule" title="Divider" onPress={() => onCommand('insertHorizontalRule')} />
            <TBtn icon="format_clear" title="Clear formatting" onPress={onClear} />
            <div className="flex-1" />
            <TBtn
                icon={focusMode ? 'fullscreen_exit' : 'fullscreen'}
                title={focusMode ? 'Exit focus mode (Esc)' : 'Focus mode'}
                active={focusMode}
                onPress={onToggleFocus}
            />
        </div>
    );
};

export default FormatToolbar;
