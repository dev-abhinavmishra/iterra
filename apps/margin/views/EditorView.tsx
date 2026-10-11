import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Note, AppSettings } from '../types';
import ChatInterface from '../components/ChatInterface';
import Skeleton from '../components/Skeleton';
import { Icon, IconBtn, Btn, Modal, Divider } from '../components/ui/primitives';
import FormatToolbar, { FormatState } from '../components/editor/FormatToolbar';
import FloatingToolbar, { InlineAIAction } from '../components/editor/FloatingToolbar';
import NoteMetaBar from '../components/editor/NoteMetaBar';
import OutlinePanel, { OutlineItem } from '../components/editor/OutlinePanel';
import FindReplace, { unwrapFindMarks } from '../components/editor/FindReplace';
import VersionHistory from '../components/editor/VersionHistory';
import AudioPlayer from '../components/editor/AudioPlayer';
import RelatedNotes from '../components/editor/RelatedNotes';
import { runAction } from '../services/aiService';
import { exportNoteMarkdown, exportNoteHtml } from '../services/exportService';
import { sanitizeHtml } from '../services/sanitize';

interface EditorViewProps {
    note: Note;
    notes?: Note[];
    onBack: () => void;
    onUpdate: (note: Note) => void;
    onToggleBookmark: (note: Note) => void;
    onOpenNote?: (note: Note) => void;
    contextualAttachments: string[];
    setContextualAttachments: React.Dispatch<React.SetStateAction<string[]>>;
    settings?: AppSettings;
}

type RailPanel = 'chat' | 'outline' | 'history';

const FONT_SIZES = { small: 15, medium: 17, large: 19 };

/* innerHTML of the editable with any transient find highlights removed. */
const cleanHtmlOf = (el: HTMLElement): string => {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('mark[data-find]').forEach(m => {
        const p = m.parentNode;
        if (!p) return;
        while (m.firstChild) p.insertBefore(m.firstChild, m);
        p.removeChild(m);
    });
    return clone.innerHTML;
};

const stripTags = (html: string): string => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // textContent concatenates block elements without any separator
    // ("HeadingSub" → one word). Seed a space at the end of each block so the
    // word count and search context see the same text a reader does.
    doc.body.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,h6,blockquote,pre,tr,td,th,br,hr').forEach(el => {
        el.appendChild(doc.createTextNode(' '));
    });
    return doc.body.textContent || '';
};

const escapeHtmlText = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const EditorView: React.FC<EditorViewProps> = ({
    note, notes, onBack, onUpdate, onToggleBookmark, onOpenNote, contextualAttachments, setContextualAttachments, settings,
}) => {
    const [content, setContent] = useState(note.content);
    const [title, setTitle] = useState(note.title);
    const editorRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved');
    const [showSource, setShowSource] = useState(false);
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [assistantWidth, setAssistantWidth] = useState(34);
    const [isDragging, setIsDragging] = useState(false);
    const [showMobileAssistant, setShowMobileAssistant] = useState(false);
    const [panel, setPanel] = useState<RailPanel>('chat');
    const [focusMode, setFocusMode] = useState(false);
    const [findOpen, setFindOpen] = useState(false);
    const [exportOpen, setExportOpen] = useState(false);
    const [isEmpty, setIsEmpty] = useState(false);
    const [versionTick, setVersionTick] = useState(0);
    const [aiError, setAiError] = useState<string | null>(null);
    const [format, setFormat] = useState<FormatState>({ bold: false, italic: false, underline: false, strike: false, block: 'p' });
    const containerRef = useRef<HTMLDivElement>(null);
    const savedRangeRef = useRef<Range | null>(null);
    const titleRef = useRef(title);
    const titleElRef = useRef<HTMLTextAreaElement>(null);
    const noteRef = useRef(note);
    const contentRef = useRef(content);
    const saveStateRef = useRef(saveState);
    const onUpdateRef = useRef(onUpdate);
    titleRef.current = title;
    noteRef.current = note;
    contentRef.current = content;
    saveStateRef.current = saveState;
    onUpdateRef.current = onUpdate;

    // The title is a textarea so long names wrap instead of clipping;
    // grow it to fit its content.
    useEffect(() => {
        const el = titleElRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }, [title]);

    const checkEmpty = useCallback(() => {
        const el = editorRef.current;
        if (!el) return;
        setIsEmpty(!(el.textContent || '').trim() && !el.querySelector('img, table, ul, ol, blockquote, pre, h1, h2, h3, hr'));
    }, []);

    /* ---------------- persistence ---------------- */

    const syncContent = useCallback(() => {
        const el = editorRef.current;
        if (!el) return;
        setContent(cleanHtmlOf(el));
        setSaveState('saving');
        checkEmpty();
    }, [checkEmpty]);

    const saveNow = useCallback(() => {
        const el = editorRef.current;
        if (!el) return;
        const html = cleanHtmlOf(el);
        onUpdate({ ...noteRef.current, title: titleRef.current, content: html, lastAccessed: new Date().toISOString() });
        setSaveState('saved');
        setVersionTick(t => t + 1);
    }, [onUpdate]);

    // Initialize content when the note changes.
    useEffect(() => {
        if (editorRef.current) {
            unwrapFindMarks(editorRef.current);
            editorRef.current.innerHTML = sanitizeHtml(note.content);
        }
        setTitle(note.title);
        setContent(note.content);
        setSaveState('saved');
        setPanel('chat');
        setFindOpen(false);
        setShowSource(false);
        checkEmpty();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [note.id]);

    // Autosave debounce.
    useEffect(() => {
        if (saveState !== 'saving') return;
        const timer = setTimeout(saveNow, 1600);
        return () => clearTimeout(timer);
    }, [content, title, saveState, saveNow]);

    // Auto-dismiss inline-AI errors.
    useEffect(() => {
        if (!aiError) return;
        const t = setTimeout(() => setAiError(null), 5000);
        return () => clearTimeout(t);
    }, [aiError]);

    // Flush a pending autosave when leaving the editor so the last
    // keystrokes inside the debounce window are not lost. Refs are
    // detached before this cleanup runs, so read the synced content
    // state rather than the DOM element.
    useEffect(() => () => {
        if (saveStateRef.current === 'saving') {
            onUpdateRef.current({
                ...noteRef.current,
                title: titleRef.current,
                content: contentRef.current,
                lastAccessed: new Date().toISOString(),
            });
        }
    }, []);

    const handleInput = () => syncContent();

    const onTitleChange = (v: string) => {
        setTitle(v.replace(/\n+/g, ' '));
        setSaveState('saving');
    };

    /* ---------------- format state + commands ---------------- */

    const updateFormat = useCallback(() => {
        const el = editorRef.current;
        const sel = window.getSelection();
        if (!el || !sel || !sel.anchorNode || !el.contains(sel.anchorNode)) return;
        try {
            setFormat({
                bold: document.queryCommandState('bold'),
                italic: document.queryCommandState('italic'),
                underline: document.queryCommandState('underline'),
                strike: document.queryCommandState('strikeThrough'),
                block: (document.queryCommandValue('formatBlock') || 'p').toString().toLowerCase(),
            });
        } catch { /* unsupported in some browsers */ }
    }, []);

    useEffect(() => {
        document.addEventListener('selectionchange', updateFormat);
        return () => document.removeEventListener('selectionchange', updateFormat);
    }, [updateFormat]);

    const execCmd = useCallback((command: string, value?: string) => {
        editorRef.current?.focus();
        document.execCommand(command, false, value);
        updateFormat();
        syncContent();
    }, [updateFormat, syncContent]);

    /* Wrap the current selection in <mark> (vermilion pencil highlight via .note-body). */
    const wrapSelection = useCallback((tag: 'mark') => {
        const sel = window.getSelection();
        const el = editorRef.current;
        if (!sel || sel.isCollapsed || !sel.rangeCount || !el) return;
        const range = sel.getRangeAt(0);
        if (!el.contains(range.commonAncestorContainer)) return;
        const wrapper = document.createElement(tag);
        try {
            range.surroundContents(wrapper);
        } catch {
            // Selection spans multiple nodes — move its contents into the mark.
            const frag = range.extractContents();
            wrapper.appendChild(frag);
            range.insertNode(wrapper);
        }
        sel.collapseToEnd();
        syncContent();
    }, [syncContent]);

    const insertTable = () => {
        const row = '<tr><td><br></td><td><br></td><td><br></td></tr>';
        execCmd('insertHTML', `<table><tbody>${row}${row}${row}</tbody></table><p><br></p>`);
    };

    const insertLink = (url: string) => {
        const el = editorRef.current;
        const sel = window.getSelection();
        if (!el || !sel) return;
        el.focus();
        if (savedRangeRef.current) {
            sel.removeAllRanges();
            sel.addRange(savedRangeRef.current);
        }
        document.execCommand('createLink', false, url);
        syncContent();
    };

    const clearFormat = () => {
        execCmd('removeFormat');
        execCmd('formatBlock', 'p');
    };

    /* ---------------- inline AI on selection ---------------- */

    const runInlineAI = async (action: InlineAIAction) => {
        const sel = window.getSelection();
        const el = editorRef.current;
        if (!sel || sel.isCollapsed || !sel.rangeCount || !el) return;
        const range = sel.getRangeAt(0);
        if (!el.contains(range.commonAncestorContainer)) return;
        const selectedText = range.toString();
        if (!selectedText.trim()) return;
        const saved = range.cloneRange();

        const result = await runAction(action, selectedText, noteRef.current.transcript);
        if (result.error || !result.content.trim()) {
            setAiError(result.error || 'The AI returned nothing usable.');
            return;
        }
        const html = sanitizeHtml(
            result.content.includes('<')
                ? result.content
                : result.content.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')
        );

        el.focus();
        sel.removeAllRanges();
        sel.addRange(saved);
        document.execCommand('insertHTML', false, html);
        syncContent();
    };

    /* ---------------- markdown typing shortcuts ---------------- */

    const BLOCK_SEL = 'p, div, li, h1, h2, h3, h4, blockquote, pre';

    const onEditorKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey && editorRef.current) {
            const sel = window.getSelection();
            if (sel && sel.isCollapsed && sel.anchorNode) {
                const root = editorRef.current;
                const anchorEl: HTMLElement | null = sel.anchorNode.nodeType === 1
                    ? sel.anchorNode as HTMLElement
                    : sel.anchorNode.parentElement;
                // Enter inside a code block must stay a newline in the same
                // block — the default splits it into two <pre> elements.
                const pre = anchorEl?.closest('pre');
                if (pre && root.contains(pre)) {
                    e.preventDefault();
                    document.execCommand('insertText', false, '\n');
                    syncContent();
                    return;
                }
                // Enter in an empty blockquote (the Enter×2 exit case) drops
                // the blockquote instead of leaving a dangling empty one.
                const bq = anchorEl?.closest('blockquote');
                if (bq && root.contains(bq) && !(bq.textContent || '').trim()) {
                    e.preventDefault();
                    const p = document.createElement('p');
                    p.appendChild(document.createElement('br'));
                    bq.parentNode?.replaceChild(p, bq);
                    const range = document.createRange();
                    range.setStart(p, 0);
                    range.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(range);
                    syncContent();
                    return;
                }
            }
        }
        if (e.key !== ' ' || !editorRef.current) return;
        const sel = window.getSelection();
        if (!sel || !sel.isCollapsed || !sel.anchorNode) return;
        const root = editorRef.current;
        const anchor = sel.anchorNode;
        // Nearest block-level ancestor of the caret — a <li> inside a <ul>
        // counts. When the editor is empty Chrome keeps a bare text node, so
        // fall back to the text node itself.
        let block: HTMLElement | null = anchor.nodeType === 1
            ? anchor as HTMLElement
            : anchor.parentElement;
        while (block && block !== root && !block.matches(BLOCK_SEL)) block = block.parentElement;
        if (!block || block === root || !root.contains(block)) block = null;
        // Converting an <li> would nest one list inside another's item — skip.
        if (block && block.tagName === 'LI') return;
        const beforeCaret = block
            ? (block.textContent || '')
            : (anchor.nodeType === 3 && root.contains(anchor) ? (anchor.nodeValue || '') : '');
        const trigger: Record<string, string> = {
            '#': 'h1', '##': 'h2', '###': 'h3',
            '>': 'blockquote', '```': 'pre',
            '-': 'ul', '*': 'ul', '1.': 'ol',
        };
        const hit = trigger[beforeCaret.trim()];
        if (!hit) return;
        e.preventDefault();

        // Build the target element directly. Chrome's execCommand on a freshly
        // emptied block pulls the previous sibling's text into the new element
        // (paragraph → list item, or into the blockquote), corrupting the note.
        const el = document.createElement(hit);
        if (hit === 'ul' || hit === 'ol') {
            const li = document.createElement('li');
            li.appendChild(document.createElement('br'));
            el.appendChild(li);
        } else {
            el.appendChild(document.createElement('br'));
        }
        const target: Node | null = block ?? (anchor.nodeType === 3 && root.contains(anchor) ? anchor : null);
        if (target && target.parentNode) target.parentNode.replaceChild(el, target);
        else root.appendChild(el);

        const caretEl: Element = el.firstElementChild ?? el;
        const range = document.createRange();
        range.setStart(caretEl, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        el.scrollIntoView({ block: 'nearest' });
        updateFormat();
        syncContent();
    };

    /* ==text== → <mark>text</mark> when the closing space is typed. */
    const tryInlineMark = () => {
        const sel = window.getSelection();
        if (!sel || !sel.isCollapsed || !editorRef.current) return;
        const node = sel.anchorNode;
        if (!node || node.nodeType !== 3) return;
        const t = node.nodeValue || '';
        const upto = t.slice(0, sel.anchorOffset);
        const m = upto.match(/==([^=\n]{1,300})==\s$/);
        if (!m) return;
        const inner = m[1];
        const start = upto.length - m[0].length;
        const rest = t.slice(sel.anchorOffset);
        node.nodeValue = t.slice(0, start) + inner + ' ' + rest;
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, start + inner.length);
        const mark = document.createElement('mark');
        try { range.surroundContents(mark); } catch { return; }
        const after = mark.nextSibling;
        if (after && after.nodeType === 3 && (after.nodeValue || '').length) {
            sel.collapse(after, Math.min(1, (after.nodeValue || '').length));
        }
    };

    const onEditorInput = () => {
        tryInlineMark();
        handleInput();
    };

    /* ---------------- keyboard: ⌘F, Esc ---------------- */

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                setFindOpen(true);
            } else if (e.key === 'Escape') {
                if (findOpen) { setFindOpen(false); if (editorRef.current) unwrapFindMarks(editorRef.current); }
                else if (focusMode) setFocusMode(false);
                else if (exportOpen) setExportOpen(false);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [findOpen, focusMode, exportOpen]);

    /* ---------------- outline ---------------- */

    const outlineItems: OutlineItem[] = useMemo(() => {
        const doc = new DOMParser().parseFromString(content, 'text/html');
        return Array.from(doc.querySelectorAll('h1, h2, h3'))
            .map(h => ({ level: parseInt(h.tagName[1], 10) as 1 | 2 | 3, text: (h.textContent || '').trim() }))
            .filter(i => i.text.length > 0);
    }, [content]);

    const jumpToHeading = (index: number) => {
        const el = editorRef.current;
        if (!el) return;
        const headings = el.querySelectorAll('h1, h2, h3');
        headings[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    /* ---------------- word count ---------------- */

    const words = useMemo(() => {
        const text = stripTags(content);
        return text.split(/\s+/).filter(Boolean).length;
    }, [content]);

    /* ---------------- source modal blob ---------------- */

    useEffect(() => {
        if (showSource && note.sourceData?.mimeType === 'application/pdf') {
            try {
                const bin = atob(note.sourceData.data);
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                setBlobUrl(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })));
            } catch (e) {
                console.error('Failed to create blob URL for PDF', e);
            }
        }
        return () => {
            if (blobUrl) {
                URL.revokeObjectURL(blobUrl);
                setBlobUrl(null);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showSource, note.sourceData]);

    /* ---------------- assistant rail resizer ---------------- */

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging || !containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const pct = ((rect.right - e.clientX) / rect.width) * 100;
            if (pct >= 20 && pct <= 50) setAssistantWidth(pct);
        };
        const handleMouseUp = () => setIsDragging(false);
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            document.body.style.userSelect = 'none';
        } else {
            document.body.style.userSelect = '';
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.userSelect = '';
        };
    }, [isDragging]);

    /* ---------------- export ---------------- */

    const exportNote = (): Note => ({
        ...noteRef.current,
        title: titleRef.current,
        content: editorRef.current ? cleanHtmlOf(editorRef.current) : noteRef.current.content,
    });

    const handleExportPDF = () => {
        const html = sanitizeHtml(editorRef.current ? cleanHtmlOf(editorRef.current) : content);
        const safeTitle = escapeHtmlText(title || 'Untitled');
        const win = window.open('', '_blank');
        if (!win) {
            alert('Please allow pop-ups to export this note as a PDF.');
            return;
        }
        win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${safeTitle}</title>
        <style>
          body { font-family: Newsreader, Georgia, 'Times New Roman', serif; max-width: 720px; margin: 40px auto; padding: 0 24px; color: #211E19; line-height: 1.65; }
          h1.doc-title { font-size: 30px; font-weight: 700; letter-spacing: -0.01em; margin: 0 0 6px; }
          h2 { font-size: 22px; font-weight: 650; margin: 1.1em 0 0.4em; }
          h3 { font-size: 18px; font-weight: 650; margin: 0.9em 0 0.35em; }
          b, strong { color: #C2420C; }
          blockquote { border-left: 2px solid #C2420C; padding-left: 0.9em; font-style: italic; color: #5C574B; }
          code { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 0.85em; background: #EFECE2; border-radius: 4px; padding: 0.1em 0.35em; }
          pre { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 0.82em; background: #EFECE2; border-radius: 8px; padding: 12px 14px; overflow-x: auto; }
          mark { background: rgba(58,92,140,.15); padding: 0 0.15em; }
          table { border-collapse: collapse; width: 100%; font-family: Archivo, Arial, sans-serif; font-size: 0.85em; }
          th, td { border-bottom: 1px solid #DDD8C8; padding: 6px 8px; text-align: left; }
          hr { border: 0; border-top: 1px solid #C9C3B2; margin: 1.4em 0; }
          .meta { font-family: 'IBM Plex Mono', monospace; color: #8A8375; font-size: 11px; margin-bottom: 28px; }
          img { max-width: 100%; }
          @media print { body { margin: 0; } }
        </style></head><body>
        <h1 class="doc-title">${safeTitle}</h1>
        <div class="meta">${note.date}${note.duration ? ' · ' + note.duration : ''} · Margin</div>
        ${html}
        </body></html>`);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 350);
    };

    const exportItems = [
        { label: 'PDF — print sheet', icon: 'print', run: handleExportPDF },
        { label: 'Markdown (.md)', icon: 'markdown', run: () => exportNoteMarkdown(exportNote()) },
        { label: 'HTML (.html)', icon: 'code', run: () => exportNoteHtml(exportNote()) },
    ];

    /* ---------------- render ---------------- */

    const fontSize = FONT_SIZES[settings?.editorFontSize || 'medium'];
    const sheetWidth = focusMode
        ? 'max-w-[820px]'
        : settings?.editorWidth === 'wide' ? 'max-w-[920px]' : 'max-w-[720px]';
    const railLabel = panel === 'chat' ? 'Assistant' : panel === 'outline' ? 'Outline' : 'History';

    return (
        <main className="flex-1 flex flex-col min-w-0 relative bg-paper">
            {!focusMode && (
                <header className="shrink-0 h-14 border-b border-line flex items-center gap-1.5 px-3 sm:px-4 bg-paper z-20">
                    <IconBtn icon="arrow_back" onClick={onBack} title="Back to notes" />
                    <IconBtn
                        icon="keep"
                        fill={note.isBookmarked}
                        active={note.isBookmarked}
                        onClick={() => onToggleBookmark(note)}
                        title={note.isBookmarked ? 'Unpin note' : 'Pin note'}
                    />
                    <div className="flex-1" />
                    <IconBtn icon="find_in_page" onClick={() => setFindOpen(true)} title="Find in note (⌘F)" />
                    <IconBtn icon="toc" onClick={() => setPanel(panel === 'outline' ? 'chat' : 'outline')} active={panel === 'outline'} title="Outline" />
                    <IconBtn icon="history" onClick={() => setPanel(panel === 'history' ? 'chat' : 'history')} active={panel === 'history'} title="Version history" />
                    {note.sourceData && (
                        <Btn size="sm" variant="ghost" icon="visibility" onClick={() => setShowSource(true)}>Source</Btn>
                    )}
                    <div className="relative">
                        <Btn size="sm" icon="download" onClick={() => setExportOpen(o => !o)}>Export</Btn>
                        {exportOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
                                <div className="absolute right-0 top-full mt-1 z-50 w-48 bg-card border border-line-2 rounded-[var(--r)] shadow-pop pop-in py-1">
                                    {exportItems.map(item => (
                                        <button
                                            key={item.label}
                                            onClick={() => { setExportOpen(false); item.run(); }}
                                            className="w-full h-8 px-3 flex items-center gap-2 text-left font-sans text-[13px] text-ink-2 hover:text-ink hover:bg-[var(--card-2)] transition-colors"
                                        >
                                            <Icon name={item.icon} size={16} className="text-ink-3" />
                                            {item.label}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                    <IconBtn
                        icon="forum"
                        className="md:hidden"
                        onClick={() => setShowMobileAssistant(true)}
                        title="Assistant"
                    />
                </header>
            )}

            <div className="flex-1 flex flex-col md:flex-row overflow-hidden" ref={containerRef}>
                {/* Editor column */}
                <div className="flex flex-col min-w-0 relative" style={{ flex: '1 1 auto' }}>
                    <FormatToolbar
                        state={format}
                        onCommand={execCmd}
                        onMark={() => wrapSelection('mark')}
                        onInsertTable={insertTable}
                        onOpenLink={() => {
                            const sel = window.getSelection();
                            savedRangeRef.current = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
                        }}
                        onInsertLink={insertLink}
                        onClear={clearFormat}
                        focusMode={focusMode}
                        onToggleFocus={() => setFocusMode(f => !f)}
                    />

                    <div className="flex-1 overflow-y-auto custom-scrollbar relative page-lines" ref={scrollRef}>
                        <FindReplace
                            open={findOpen}
                            onClose={() => setFindOpen(false)}
                            editorEl={editorRef.current}
                            onChanged={syncContent}
                        />

                        <div className={`mx-auto w-full ${sheetWidth} px-4 sm:px-6 py-6 sm:py-8 transition-[max-width] duration-200`}>
                            <AudioPlayer note={note} />

                            {/* Paper sheet */}
                            <div className="relative bg-card border border-line rounded-[var(--r-lg)] shadow-card">
                                {/* ruled left margin */}
                                <div className="absolute top-0 bottom-0 left-8 sm:left-11 w-px bg-[var(--mark)] opacity-25 pointer-events-none" />
                                <div className="pl-12 sm:pl-16 pr-5 sm:pr-10 py-8 sm:py-10">
                                    <textarea
                                        key={note.id}
                                        ref={titleElRef}
                                        value={title}
                                        rows={1}
                                        onChange={(e) => onTitleChange(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                editorRef.current?.focus();
                                            }
                                        }}
                                        className="ink-write w-full bg-transparent border-0 focus:outline-none font-serif text-[28px] sm:text-[32px] font-bold leading-tight tracking-[-0.01em] text-ink placeholder:text-ink-3/60 placeholder:font-hand placeholder:font-medium resize-none overflow-hidden"
                                        placeholder="Untitled"
                                        aria-label="Note title"
                                    />
                                    {!focusMode && (
                                        <NoteMetaBar
                                            date={note.date}
                                            duration={note.duration}
                                            words={words}
                                            saveState={saveState}
                                        />
                                    )}
                                    <Divider className="my-5" />
                                    <div className="relative">
                                        {isEmpty && (
                                            <div className="absolute top-0 left-0 font-serif text-[17px] text-ink-3/60 pointer-events-none select-none">
                                                Start writing — # for a heading, - for a list, &gt; for a quote…
                                            </div>
                                        )}
                                        <div
                                            ref={editorRef}
                                            className="note-body ruled outline-none min-h-[55vh] caret-[var(--mark)]"
                                            style={{ fontSize, outline: 'none' }}
                                            contentEditable
                                            suppressContentEditableWarning
                                            spellCheck={settings?.spellcheck !== false}
                                            onInput={onEditorInput}
                                            onKeyDown={onEditorKeyDown}
                                            onBlur={() => { if (saveState === 'saving') saveNow(); }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Resizer */}
                <div
                    className="hidden md:flex w-1 cursor-col-resize bg-transparent items-center justify-center group z-20"
                    onMouseDown={() => setIsDragging(true)}
                >
                    <div className={`h-9 w-px transition-colors ${isDragging ? 'bg-[var(--mark)]' : 'bg-[var(--line-2)] group-hover:bg-[var(--ink-3)]'}`} />
                </div>

                {/* Assistant rail */}
                <div
                    className="hidden md:flex flex-col bg-paper border-l border-line min-w-0 relative z-10"
                    style={{ flex: `0 0 ${assistantWidth}%` }}
                >
                    <div className="h-10 border-b border-line flex items-center justify-between px-4 shrink-0">
                        <div className="flex items-center gap-2">
                            <Icon name={panel === 'chat' ? 'forum' : panel === 'outline' ? 'toc' : 'history'} size={16} className="text-ink-3" />
                            <h2 className="font-sans text-xs font-medium text-ink-2">{railLabel}</h2>
                        </div>
                        {panel !== 'chat' && (
                            <IconBtn icon="close" size={15} title="Back to assistant" onClick={() => setPanel('chat')} />
                        )}
                    </div>

                    {panel === 'chat' && (
                        <div className="flex-1 min-h-0 flex flex-col">
                            <ChatInterface
                                context={note.transcript || stripTags(content)}
                                contextualAttachments={contextualAttachments}
                                setContextualAttachments={setContextualAttachments}
                            />
                        </div>
                    )}
                    {panel === 'outline' && <OutlinePanel items={outlineItems} onJump={jumpToHeading} />}
                    {panel === 'history' && (
                        <VersionHistory
                            noteId={note.id}
                            refreshKey={versionTick}
                            onRestore={(html) => {
                                if (editorRef.current) {
                                    editorRef.current.innerHTML = sanitizeHtml(html);
                                    handleInput();
                                }
                                setPanel('chat');
                            }}
                        />
                    )}

                    {notes && onOpenNote && (
                        <RelatedNotes note={note} notes={notes} onOpenNote={onOpenNote} />
                    )}
                </div>
            </div>

            <FloatingToolbar
                editorEl={editorRef.current}
                onCommand={execCmd}
                onMark={() => wrapSelection('mark')}
                onAI={runInlineAI}
            />

            {aiError && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pop-in flex items-center gap-2 bg-card border border-[var(--bad)]/40 rounded-[var(--r)] shadow-pop px-4 py-2.5">
                    <Icon name="error" size={16} className="text-bad shrink-0" />
                    <span className="font-sans text-[13px] text-ink">{aiError}</span>
                    <IconBtn icon="close" size={14} title="Dismiss" onClick={() => setAiError(null)} />
                </div>
            )}

            {/* Assistant — mobile overlay */}
            {showMobileAssistant && (
                <div className="fixed inset-0 z-50 bg-paper flex flex-col md:hidden fade-in">
                    <div className="h-14 border-b border-line flex items-center justify-between px-4 bg-paper shrink-0">
                        <div className="flex items-center gap-2">
                            <Icon name="forum" size={18} className="text-ink-3" />
                            <h2 className="font-sans text-sm font-medium text-ink">Assistant</h2>
                        </div>
                        <IconBtn icon="close" onClick={() => setShowMobileAssistant(false)} title="Close" />
                    </div>
                    <ChatInterface
                        context={note.transcript || stripTags(content)}
                        contextualAttachments={contextualAttachments}
                        setContextualAttachments={setContextualAttachments}
                    />
                </div>
            )}

            {/* Source viewer */}
            <Modal open={showSource && !!note.sourceData} onClose={() => setShowSource(false)} width="max-w-4xl">
                <div className="h-12 border-b border-line flex items-center justify-between px-4 shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <Icon
                            name={
                                note.sourceData?.mimeType.startsWith('audio/') ? 'audio_file' :
                                note.sourceData?.mimeType === 'application/pdf' ? 'picture_as_pdf' : 'image'
                            }
                            size={18}
                            className="text-[var(--mark)]"
                        />
                        <span className="font-sans text-sm font-medium text-ink truncate">Source file</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {note.sourceData?.mimeType === 'application/pdf' && (
                            <Btn
                                size="sm"
                                icon="download"
                                onClick={() => {
                                    const a = document.createElement('a');
                                    a.href = `data:application/pdf;base64,${note.sourceData!.data}`;
                                    a.download = `${title || 'note'}.pdf`;
                                    a.click();
                                }}
                            >
                                Download
                            </Btn>
                        )}
                        <IconBtn icon="close" onClick={() => setShowSource(false)} title="Close" />
                    </div>
                </div>
                <div className="h-[70vh] overflow-auto custom-scrollbar bg-card-2 flex items-center justify-center p-4">
                    {note.sourceData?.mimeType === 'application/pdf' ? (
                        blobUrl ? (
                            <object data={blobUrl} type="application/pdf" className="w-full h-full rounded-[var(--r)] border border-line bg-card">
                                <div className="flex flex-col items-center justify-center h-full gap-3 text-ink-3">
                                    <Icon name="picture_as_pdf" size={36} />
                                    <p className="font-sans text-sm">PDF preview is blocked by your browser.</p>
                                </div>
                            </object>
                        ) : (
                            <div className="w-full max-w-sm flex flex-col gap-2.5">
                                <Skeleton width="40%" />
                                <Skeleton width="80%" />
                            </div>
                        )
                    ) : note.sourceData?.mimeType.startsWith('image/') ? (
                        <img
                            src={`data:${note.sourceData.mimeType};base64,${note.sourceData.data}`}
                            alt="Source"
                            className="max-w-full max-h-full object-contain rounded-[var(--r)] border border-line bg-card"
                        />
                    ) : note.sourceData?.mimeType.startsWith('audio/') ? (
                        <div className="w-full max-w-md bg-card border border-line rounded-[var(--r-lg)] shadow-card p-6 flex flex-col items-center gap-4">
                            <div className="w-14 h-14 rounded-full bg-[var(--mark-soft)] border border-[var(--line)] flex items-center justify-center">
                                <Icon name="graphic_eq" size={26} className="text-[var(--mark)]" />
                            </div>
                            <div className="font-serif text-lg text-ink text-center">{title || 'Untitled'}</div>
                            <audio controls src={`data:${note.sourceData.mimeType};base64,${note.sourceData.data}`} className="w-full" />
                        </div>
                    ) : (
                        <div className="text-ink-3 font-sans text-sm">No preview available for this file type.</div>
                    )}
                </div>
            </Modal>
        </main>
    );
};

export default EditorView;
