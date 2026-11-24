import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Note } from '../types';
import ChatInterface from '../components/ChatInterface';
import Skeleton from '../components/Skeleton';
import { Icon, IconBtn, Btn, Modal, Divider } from '../components/ui/primitives';
import { PlacePortal } from '../../portal';
import NoteMetaBar from '../components/editor/NoteMetaBar';
import OutlinePanel, { OutlineItem } from '../components/editor/OutlinePanel';
import AudioPlayer from '../components/editor/AudioPlayer';
import RelatedNotes from '../components/editor/RelatedNotes';
import SharedNoteLink from '../components/SharedNoteLink';
import TerrainChips from '../components/TerrainChips';
import { exportNoteMarkdown, exportNoteHtml } from '../services/exportService';
import { fetchNoteMedia } from '../services/storageService';
import { sanitizeHtml } from '../services/sanitize';
import { openMaterialInNotes } from '../services/inkHandoff';

/* MaterialView — the margin's read-only shelf card. Study Materials stores
   and organizes class information; authoring lives in the Notes app (ink),
   so this view NEVER mutates note.content — no contentEditable, no autosave,
   no format toolbar, no version restore. The only write it can make is
   organizational metadata (the course filing on NoteMetaBar) via onUpdate.
   "Edit in Notes" hands the material to inkHandoff, which seeds a page in
   ink with margin:note:<id> provenance. */

interface MaterialViewProps {
    note: Note;
    notes?: Note[];
    onBack: () => void;
    /** Metadata-only updates (course binding). Content edits must never
        reach this — they belong to ink. */
    onUpdate: (note: Note) => void;
    onToggleBookmark: (note: Note) => void;
    onOpenNote?: (note: Note) => void;
    contextualAttachments: string[];
    setContextualAttachments: React.Dispatch<React.SetStateAction<string[]>>;
}

type RailPanel = 'chat' | 'outline';

const stripTags = (html: string): string => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.body.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,h6,blockquote,pre,tr,td,th,br,hr').forEach(el => {
        el.appendChild(doc.createTextNode(' '));
    });
    return doc.body.textContent || '';
};

const escapeHtmlText = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* Honest-empty state for the Source modal — a marker note whose media isn't
   in the cloud (unsigned, or it only ever lived on another device) gets this
   instead of a dead media element pointing at an empty data: URL. */
const SourceUnavailable: React.FC = () => (
    <div className="flex flex-col items-center gap-2 text-ink-3 px-6 text-center">
        <Icon name="cloud_off" size={28} />
        <p className="font-sans text-sm">The source media isn't synced to this device.</p>
    </div>
);

const MaterialView: React.FC<MaterialViewProps> = ({
    note, notes, onBack, onUpdate, onToggleBookmark, onOpenNote, contextualAttachments, setContextualAttachments,
}) => {
    const [showSource, setShowSource] = useState(false);
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    /* Resolved source media for the Source modal — cloud notes can carry a
       marker ({mimeType, data: ''}) whose bytes must be lazy-fetched. */
    const [mediaData, setMediaData] = useState<string | null>(null);
    const [mediaFailed, setMediaFailed] = useState(false);
    const [panel, setPanel] = useState<RailPanel>('chat');
    const [showMobileAssistant, setShowMobileAssistant] = useState(false);
    const [exportOpen, setExportOpen] = useState(false);
    const [showTranscript, setShowTranscript] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const bodyHtml = useMemo(() => sanitizeHtml(note.content || ''), [note.id, note.content]);
    const bodyText = useMemo(() => stripTags(note.content || ''), [note.id, note.content]);
    const words = useMemo(() => bodyText.split(/\s+/).filter(Boolean).length, [bodyText]);
    const transcript = (note.transcript || '').trim();
    const attachments = note.attachments || [];

    /* Reset per-material view state when a different card is opened. */
    useEffect(() => {
        setShowSource(false);
        setShowTranscript(false);
        setPanel('chat');
        setExportOpen(false);
    }, [note.id]);

    /* ---------------- outline (read-only jump targets) ---------------- */

    const outlineItems: OutlineItem[] = useMemo(() => {
        const doc = new DOMParser().parseFromString(note.content || '', 'text/html');
        return Array.from(doc.querySelectorAll('h1, h2, h3'))
            .map(h => ({ level: parseInt(h.tagName[1], 10) as 1 | 2 | 3, text: (h.textContent || '').trim() }))
            .filter(i => i.text.length > 0);
    }, [note.id, note.content]);

    const jumpToHeading = (index: number) => {
        const el = contentRef.current;
        if (!el) return;
        const headings = el.querySelectorAll('h1, h2, h3');
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        headings[index]?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    };

    /* ---------------- source modal blob ---------------- */

    /* Normalize sourceData to primitives: cloud rows can carry a marker
       ({mimeType: null, data: ''}) or a legacy shape with no usable
       mimeType — primitive deps keep the effect from re-running on a
       re-created sourceData object of equal content. */
    const hasSource = !!note.sourceData;
    const sourceMime = typeof note.sourceData?.mimeType === 'string' ? note.sourceData.mimeType : '';
    const sourceData = typeof note.sourceData?.data === 'string' ? note.sourceData.data : '';

    /* Any marker (empty data) lazy-fetches its media — not just PDFs. Audio
       and image markers used to render dead media elements pointing at an
       empty data: URL. `mediaData` is the resolved base64 the modal renders
       (for every type); `blobUrl` is the PDF-specific object URL, created
       only for that type and revoked from the same closure that made it —
       reading state in cleanup would revoke the PREVIOUS url and leak the
       one the async build just created. */
    useEffect(() => {
        if (!showSource || !hasSource) return;
        let cancelled = false;
        let objectUrl: string | null = null;
        const build = (data: string) => {
            if (cancelled || !data) return;
            setMediaData(data);
            if (sourceMime === 'application/pdf') {
                try {
                    const bin = atob(data);
                    const bytes = new Uint8Array(bin.length);
                    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                    objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
                    setBlobUrl(objectUrl);
                } catch (e) {
                    console.error('Failed to create blob URL for PDF', e);
                    setMediaFailed(true);
                }
            }
        };
        if (sourceData) build(sourceData);
        else void fetchNoteMedia(note.id).then((m) => {
            if (cancelled) return;
            if (m?.data) build(m.data);
            else setMediaFailed(true);
        });
        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            setBlobUrl(null);
            setMediaData(null);
            setMediaFailed(false);
        };
    }, [showSource, note.id, hasSource, sourceMime, sourceData]);

    /* While the fetch is in flight show skeletons; a resolved-null fetch
       (unsigned, or the row never stored media) reports honestly instead of
       rendering an empty data: URL. resolvedMedia falls back to the inline
       data so a note with media already on it doesn't flash the unavailable
       state for the first frame before the effect's setMediaData lands. */
    const sourcePending = hasSource && !sourceData && !mediaData && !mediaFailed;
    const resolvedMedia = mediaData || sourceData || null;

    /* ---------------- export (read-only — exports what is stored) ---------------- */

    const storedNote: Note = { ...note, content: note.content || '' };

    const handleExportPDF = () => {
        const html = sanitizeHtml(note.content || '');
        const safeTitle = escapeHtmlText(note.title || 'Untitled');
        const win = window.open('', '_blank');
        if (!win) {
            alert('Please allow pop-ups to export this material.');
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
          pre { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 0.82em; background: #EFECE2; border-radius: 8px; padding: 12px 14px; overflow-x: auto; white-space: pre-wrap; }
          mark { background: rgba(58,92,140,.15); padding: 0 0.15em; }
          table { border-collapse: collapse; width: 100%; font-family: Archivo, Arial, sans-serif; font-size: 0.85em; }
          th, td { border-bottom: 1px solid #DDD8C8; padding: 6px 8px; text-align: left; }
          hr { border: 0; border-top: 1px solid #C9C3B2; margin: 1.4em 0; }
          .meta { font-family: 'IBM Plex Mono', monospace; color: #8A8375; font-size: 11px; margin-bottom: 28px; }
          img { max-width: 100%; }
          @media print { body { margin: 0; } }
        </style></head><body>
        <h1 class="doc-title">${safeTitle}</h1>
        <div class="meta">${note.date}${note.duration ? ' · ' + note.duration : ''} · Study Materials</div>
        ${html}
        </body></html>`);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 350);
    };

    const exportItems = [
        { label: 'PDF — print sheet', icon: 'print', run: handleExportPDF },
        { label: 'Markdown (.md)', icon: 'markdown', run: () => exportNoteMarkdown(storedNote) },
        { label: 'HTML (.html)', icon: 'code', run: () => exportNoteHtml(storedNote) },
    ];

    const railLabel = panel === 'chat' ? 'Assistant' : 'Outline';
    const hasBody = !!(note.content || '').trim();
    const chatContext = note.transcript || bodyText;

    return (
        <main className="flex-1 flex flex-col min-w-0 relative bg-paper">
            <header className="shrink-0 h-14 border-b border-line flex items-center gap-1.5 px-3 sm:px-4 bg-paper z-20">
                <IconBtn icon="arrow_back" onClick={onBack} title="Back to library" />
                <IconBtn
                    icon="keep"
                    fill={note.isBookmarked}
                    active={note.isBookmarked}
                    onClick={() => onToggleBookmark(note)}
                    title={note.isBookmarked ? 'Unpin material' : 'Pin material'}
                />
                <SharedNoteLink />
                <a
                    href={`/apps/timer/?intent=${encodeURIComponent(note.title || 'study')}&minutes=25&from=margin`}
                    target="_blank"
                    rel="noreferrer"
                    title="Start a 25-minute focus block on this material in the Instruments"
                    className="hidden sm:inline-flex items-center gap-1 h-8 px-2 rounded-[var(--r-sm)] font-sans text-[12px] text-ink-3 hover:text-ink hover:bg-[var(--card-2)] transition-colors"
                >
                    focus →
                </a>
                {/* terrain bridges — deck backlink + send this material to ink */}
                <TerrainChips note={note} getText={() => bodyText} />
                <div className="flex-1" />
                <IconBtn icon="toc" onClick={() => setPanel(panel === 'outline' ? 'chat' : 'outline')} active={panel === 'outline'} title="Outline" />
                {hasSource && (
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
                <Btn
                    size="sm"
                    variant="primary"
                    icon="edit_note"
                    onClick={() => openMaterialInNotes(note)}
                    title="Open this material in Notes to edit it"
                >
                    Edit in Notes
                </Btn>
                <IconBtn
                    icon="forum"
                    className="md:hidden"
                    onClick={() => setShowMobileAssistant(true)}
                    title="Assistant"
                />
            </header>

            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                {/* Material column */}
                <div className="flex flex-col min-w-0 relative" style={{ flex: '1 1 auto' }}>
                    <div className="flex-1 overflow-y-auto custom-scrollbar relative page-lines" ref={scrollRef}>
                        <div className="mx-auto w-full max-w-[720px] px-4 sm:px-6 py-6 sm:py-8">
                            <AudioPlayer note={note} />

                            {/* Paper sheet — read-only: the stored content is
                                rendered, never edited. */}
                            <div className="relative bg-card border border-line rounded-[var(--r-lg)] shadow-card">
                                {/* ruled left margin */}
                                <div className="absolute top-0 bottom-0 left-8 sm:left-11 w-px bg-[var(--mark)] opacity-25 pointer-events-none" />
                                <div className="pl-12 sm:pl-16 pr-5 sm:pr-10 py-8 sm:py-10">
                                    <h1 className="ink-write w-full font-serif text-[28px] sm:text-[32px] font-bold leading-tight tracking-[-0.01em] text-ink">
                                        {note.title || 'Untitled'}
                                    </h1>
                                    <NoteMetaBar
                                        date={note.date}
                                        duration={note.duration}
                                        words={words}
                                        saveState="saved"
                                        course={note.course}
                                        courseId={note.courseId}
                                        onCourseChange={(courseId, course) => onUpdate({ ...note, courseId, course })}
                                    />
                                    <p className="font-hand text-[15px] text-ink-3 mt-2">
                                        Stored material — refine the text in Notes.
                                    </p>
                                    <Divider className="my-5" />
                                    <div ref={contentRef} className="note-body ruled">
                                        {hasBody ? (
                                            <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
                                        ) : transcript ? (
                                            <p className="text-ink-3">No refined content yet — the transcript below is the material.</p>
                                        ) : (
                                            <p className="text-ink-3">This material has no text content — check the source or attachments.</p>
                                        )}
                                    </div>

                                    {attachments.length > 0 && (
                                        <div className="mt-8">
                                            <Divider className="mb-4" />
                                            <h2 className="font-hand text-[17px] text-ink-3 mb-3">Attachments</h2>
                                            <div className="flex flex-col gap-3">
                                                {attachments.map((a, i) => (
                                                    <div key={i} className="border border-line rounded-[var(--r)] bg-card-2/50 p-3">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <Icon name={a.type === 'image' ? 'image' : a.type === 'pdf' ? 'picture_as_pdf' : 'description'} size={15} className="text-ink-3" />
                                                            <span className="font-mono text-[11px] text-ink-3 truncate">{a.name || `attachment ${i + 1}`}</span>
                                                        </div>
                                                        {a.type === 'image' ? (
                                                            <img src={`data:image/png;base64,${a.content}`} alt={a.name || 'attachment'} className="max-w-full rounded-[var(--r-sm)] border border-line" />
                                                        ) : a.type === 'text' ? (
                                                            <pre className="font-mono text-[11px] text-ink-2 whitespace-pre-wrap break-words max-h-64 overflow-y-auto custom-scrollbar">{a.content}</pre>
                                                        ) : (
                                                            <p className="font-sans text-[12px] text-ink-3">File attached — export the note to take it with you.</p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {transcript && (
                                        <div className="mt-8">
                                            <Divider className="mb-4" />
                                            <button
                                                type="button"
                                                onClick={() => setShowTranscript(t => !t)}
                                                className="flex items-center gap-2 font-hand text-[17px] text-ink-3 hover:text-ink transition-colors"
                                            >
                                                <Icon name={showTranscript ? 'expand_less' : 'expand_more'} size={16} />
                                                Transcript
                                            </button>
                                            {showTranscript && (
                                                <pre className="mt-3 font-mono text-[11.5px] leading-relaxed text-ink-2 whitespace-pre-wrap break-words max-h-[480px] overflow-y-auto custom-scrollbar bg-card-2/40 border border-line rounded-[var(--r)] p-4">
                                                    {transcript}
                                                </pre>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Assistant / outline rail */}
                <div className="hidden md:flex flex-col bg-paper border-l border-line min-w-0 relative z-10" style={{ flex: '0 0 34%' }}>
                    <div className="h-10 border-b border-line flex items-center justify-between px-4 shrink-0">
                        <div className="flex items-center gap-2">
                            <Icon name={panel === 'chat' ? 'forum' : 'toc'} size={16} className="text-ink-3" />
                            <h2 className="font-sans text-xs font-medium text-ink-2">{railLabel}</h2>
                        </div>
                        {panel !== 'chat' && (
                            <IconBtn icon="close" size={15} title="Back to assistant" onClick={() => setPanel('chat')} />
                        )}
                    </div>

                    {panel === 'chat' && (
                        <div className="flex-1 min-h-0 flex flex-col">
                            <ChatInterface
                                context={chatContext}
                                contextualAttachments={contextualAttachments}
                                setContextualAttachments={setContextualAttachments}
                            />
                        </div>
                    )}
                    {panel === 'outline' && <OutlinePanel items={outlineItems} onJump={jumpToHeading} />}

                    {notes && onOpenNote && (
                        <RelatedNotes note={note} notes={notes} onOpenNote={onOpenNote} />
                    )}
                </div>
            </div>

            {/* Assistant — mobile overlay */}
            {showMobileAssistant && (
                /* portaled to the place root — the `relative` <main> would
                   otherwise leave the sidebar rail uncovered */
                <PlacePortal place="margin">
                <div className="absolute inset-0 z-50 bg-paper flex flex-col md:hidden fade-in">
                    <div className="h-14 border-b border-line flex items-center justify-between px-4 bg-paper shrink-0">
                        <div className="flex items-center gap-2">
                            <Icon name="forum" size={18} className="text-ink-3" />
                            <h2 className="font-sans text-sm font-medium text-ink">Assistant</h2>
                        </div>
                        <IconBtn icon="close" onClick={() => setShowMobileAssistant(false)} title="Close" />
                    </div>
                    <ChatInterface
                        context={chatContext}
                        contextualAttachments={contextualAttachments}
                        setContextualAttachments={setContextualAttachments}
                    />
                </div>
                </PlacePortal>
            )}

            {/* Source viewer */}
            <Modal open={showSource && !!note.sourceData} onClose={() => setShowSource(false)} width="max-w-4xl">
                <div className="h-12 border-b border-line flex items-center justify-between px-4 shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <Icon
                            name={
                                sourceMime.startsWith('audio/') ? 'audio_file' :
                                sourceMime === 'application/pdf' ? 'picture_as_pdf' : 'image'
                            }
                            size={18}
                            className="text-[var(--mark)]"
                        />
                        <span className="font-sans text-sm font-medium text-ink truncate">Source file</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {sourceMime === 'application/pdf' && (
                            <Btn
                                size="sm"
                                icon="download"
                                disabled={!blobUrl}
                                onClick={() => {
                                    /* blobUrl is built from the RESOLVED media —
                                       a marker note's own data would be an
                                       empty download. */
                                    if (!blobUrl) return;
                                    const a = document.createElement('a');
                                    a.href = blobUrl;
                                    a.download = `${note.title || 'note'}.pdf`;
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
                    {sourceMime === 'application/pdf' ? (
                        blobUrl ? (
                            <object data={blobUrl} type="application/pdf" className="w-full h-full rounded-[var(--r)] border border-line bg-card">
                                <div className="flex flex-col items-center justify-center h-full gap-3 text-ink-3">
                                    <Icon name="picture_as_pdf" size={36} />
                                    <p className="font-sans text-sm">PDF preview is blocked by your browser.</p>
                                </div>
                            </object>
                        ) : sourcePending ? (
                            <div className="w-full max-w-sm flex flex-col gap-2.5">
                                <Skeleton width="40%" />
                                <Skeleton width="80%" />
                            </div>
                        ) : (
                            <SourceUnavailable />
                        )
                    ) : sourceMime.startsWith('image/') ? (
                        resolvedMedia ? (
                            <img
                                src={`data:${sourceMime};base64,${resolvedMedia}`}
                                alt="Source"
                                className="max-w-full max-h-full object-contain rounded-[var(--r)] border border-line bg-card"
                            />
                        ) : sourcePending ? (
                            <div className="w-full max-w-sm flex flex-col gap-2.5">
                                <Skeleton width="40%" />
                                <Skeleton width="80%" />
                            </div>
                        ) : (
                            <SourceUnavailable />
                        )
                    ) : sourceMime.startsWith('audio/') ? (
                        resolvedMedia ? (
                            <div className="w-full max-w-md bg-card border border-line rounded-[var(--r-lg)] shadow-card p-6 flex flex-col items-center gap-4">
                                <div className="w-14 h-14 rounded-full bg-[var(--mark-soft)] border border-[var(--line)] flex items-center justify-center">
                                    <Icon name="graphic_eq" size={26} className="text-[var(--mark)]" />
                                </div>
                                <div className="font-serif text-lg text-ink text-center">{note.title || 'Untitled'}</div>
                                <audio controls src={`data:${sourceMime};base64,${resolvedMedia}`} className="w-full" />
                            </div>
                        ) : sourcePending ? (
                            <div className="w-full max-w-sm flex flex-col gap-2.5">
                                <Skeleton width="40%" />
                                <Skeleton width="80%" />
                            </div>
                        ) : (
                            <SourceUnavailable />
                        )
                    ) : (
                        <div className="text-ink-3 font-sans text-sm">No preview available for this file type.</div>
                    )}
                </div>
            </Modal>
        </main>
    );
};

export default MaterialView;
