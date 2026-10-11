import React, { useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { Editor as TiptapEditor } from '@tiptap/react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { useStore, type Draft } from '../../store';
import { RichEditor } from '../editor/RichEditor';
import {
  findBacklinksIndexed, getNoteIndex, noteToMarkdown, downloadFile, slugify,
  sanitizeDoc, extractText, type TipTapNode,
} from '../../lib/notes';
import { formatDistanceToNow, format } from 'date-fns';
import {
  ArrowLeft, FolderOpen, Pin, Copy, FileDown, Link2, Trash2,
  MoreHorizontal, Plus, CornerLeftUp, Droplet, Printer, Stamp,
  History, Undo2, Redo2, Highlighter, Underline,
} from 'lucide-react';
import { InkBlot, InkDrop, PenNib, PenRest, Spatter, Squiggle, TornEdge } from '../../lib/ink';
import { PENS, PEN_ORDER, penOf, type PenId } from '../../lib/pens';
import { useNow } from '../../lib/useNow';

type SaveState = 'idle' | 'saving' | 'saved';

export const Editor: React.FC = () => {
  const {
    activeNoteId, notes, updateNote, updateNoteFolder, folders, setNoteTags,
    togglePin, duplicateNote, trashNote, setActiveNote, prefs, drafts,
    restoreDraft,
  } = useStore();
  const activeNote = notes.find(n => n.id === activeNoteId);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [editor, setEditor] = useState<TiptapEditor | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [tagInputOpen, setTagInputOpen] = useState(false);
  const [tagValue, setTagValue] = useState('');
  const [dropLanded, setDropLanded] = useState(false);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [draftPreview, setDraftPreview] = useState(0);
  const [penCupOpen, setPenCupOpen] = useState(false);
  const [crumpling, setCrumpling] = useState(false);
  const [pressing, setPressing] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const depthRef = useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    if (!activeNote) { setDropLanded(false); return; }
    // Every page gets a drop when it's opened — the pen touching down.
    setDropLanded(true);
    setSaveState('idle'); // a fresh page owes no one a save badge
    const t = setTimeout(() => setDropLanded(false), 1100);
    return () => clearTimeout(t);
  }, [activeNote?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // One parse of the whole library per change — backlinks, and anything
  // else that needs flat text, read from the index instead of re-walking JSON.
  const noteIndex = useMemo(() => getNoteIndex(notes), [notes]);
  const pen = penOf(activeNote?.ink);
  const now = useNow();

  const backlinks = useMemo(
    () => (activeNote ? findBacklinksIndexed(notes, noteIndex, activeNote.title || '') : []),
    [notes, noteIndex, activeNote]
  );

  const noteDrafts = useMemo(
    () => (activeNote ? [...(drafts[activeNote.id] ?? [])].reverse() : []),
    [drafts, activeNote]
  );

  const triggerSave = () => {
    setSaveState('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
    }, 700);
  };

  const handleContentUpdate = (json: string, wordCount: number) => {
    if (!activeNote) return;
    updateNote(activeNote.id, { content: json, wordCount });
    triggerSave();
  };

  const insertWikiLink = (title: string) => {
    editor?.chain().focus().insertContent(`[[${title}]] `).run();
    setLinkPickerOpen(false);
  };

  const stampDate = () => {
    editor?.chain().focus().insertContent(`${format(new Date(), 'EEEE, MMMM d, yyyy')} — `).run();
    setMenuOpen(false);
  };

  const submitTag = (e: React.FormEvent) => {
    e.preventDefault();
    const tag = tagValue.trim().replace(/^#/, '').toUpperCase();
    if (tag && activeNote && !activeNote.tags.includes(tag)) {
      setNoteTags(activeNote.id, [...activeNote.tags, tag]);
    }
    setTagValue('');
    setTagInputOpen(false);
  };

  // The ink line tracks how far down the sheet the reader has gone —
  // direct DOM write, not state, so scrolling costs nothing.
  const trackScroll = () => {
    const el = scrollRef.current;
    const bar = depthRef.current;
    if (!el || !bar) return;
    const range = el.scrollHeight - el.clientHeight;
    const pct = range <= 8 ? 1 : Math.min(1, Math.max(0, el.scrollTop / range));
    bar.style.height = `${(pct * 100).toFixed(1)}%`;
  };

  React.useEffect(() => {
    depthRef.current?.style.setProperty('height', '0%');
    requestAnimationFrame(trackScroll);
  }, [activeNote?.id]);

  // The link shelf reads the desk the way you left it — most recently
  // touched pages first.
  const liveNotes = useMemo(
    () => notes
      .filter(n => !n.trashedAt && n.id !== activeNote?.id)
      .sort((a, b) => b.lastModified - a.lastModified),
    [notes, activeNote?.id]
  );

  const editorClasses = clsx(
    prefs.editorTextSize !== 'md' && `pref-text-${prefs.editorTextSize}`
  );

  return (
    <div className={clsx(
      'flex-col overflow-hidden',
      activeNote
        ? 'fixed inset-0 z-[60] flex md:static md:z-auto md:flex-1'
        : 'hidden md:flex md:flex-1'
    )}>
      {!activeNote ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-desk">
          <PenRest className="w-32 h-16 opacity-80" />
          <p className="font-serif text-xl text-ink-faint">Pick a page, or start a new one.</p>
          <p className="font-mono text-2xs text-ink-ghost">⌘K — search everything</p>
        </div>
      ) : (
        <section
          className={clsx('flex-1 flex flex-col relative md:m-3 sheet paper-grain overflow-hidden', crumpling && 'crumpling')}
          style={{ '--pen': pen.color } as React.CSSProperties}
        >
          {pressing && <div className="ink-press" aria-hidden />}
          {/* deckle edge — the sheet was torn from the pad */}
          <TornEdge seed={activeNote.id} className="hidden md:block w-full h-[9px] -mt-px flex-shrink-0 relative z-[2]" />

          {/* Sheet header — desk tools */}
          <div className="flex items-center justify-between gap-3 px-5 md:px-8 py-3 border-b border-line flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => setActiveNote(null)}
                className="md:hidden w-8 h-8 -ml-2 flex items-center justify-center rounded text-ink-faint hover:text-ink"
                aria-label="Back to list"
              >
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              </button>
              <label className="flex items-center gap-1.5 text-xs font-medium text-ink-faint hover:text-ink transition-colors px-1.5 py-1 rounded hover:bg-paper-dim cursor-pointer">
                <FolderOpen className="w-3.5 h-3.5" strokeWidth={1.75} />
                <select
                  aria-label="Move note to folder"
                  value={activeNote.folder}
                  onChange={event => updateNoteFolder(activeNote.id, event.target.value)}
                  className="bg-transparent border-0 p-0 pr-4 text-xs font-medium focus:ring-0 cursor-pointer text-ink-soft"
                >
                  {folders.map(folder => <option key={folder.id} value={folder.name}>{folder.name}</option>)}
                  {!folders.some(folder => folder.name === activeNote.folder) && <option value={activeNote.folder}>{activeNote.folder}</option>}
                </select>
              </label>

              {/* The pen cup — which pen this page is written with */}
              <div className="relative">
                <button
                  onClick={() => setPenCupOpen(open => !open)}
                  title={`The pen cup — ${pen.name}`}
                  aria-label="Choose this page's pen"
                  aria-expanded={penCupOpen}
                  aria-haspopup="menu"
                  className="w-8 h-8 flex items-center justify-center rounded hover:bg-paper-dim transition-colors"
                  style={{ color: pen.color }}
                >
                  <PenNib className="w-4 h-4" />
                </button>
                <AnimatePresence>
                  {penCupOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setPenCupOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.12 }}
                        className="absolute left-0 top-full mt-1 z-50 w-44 bg-paper border border-line rounded shadow-pop py-1"
                      >
                        <div className="px-3 pt-2 pb-1 font-mono text-2xs uppercase tracking-[0.16em] text-ink-ghost">The pen cup</div>
                        {PEN_ORDER.map(id => {
                          const p = PENS[id];
                          const active = id === (activeNote.ink ?? 'ink');
                          return (
                            <button
                              key={id}
                              onClick={() => { updateNote(activeNote.id, { ink: id }); setPenCupOpen(false); }}
                              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-paper-dim transition-colors"
                            >
                              <InkBlot seed={`pen:${id}`} size={16} color={p.color} opacity={0.8} satellites={1} />
                              <span className="flex-1 font-sans text-xs" style={{ color: p.color }}>{p.name}</span>
                              {active && <PenNib className="w-3 h-3 text-ink-faint" />}
                            </button>
                          );
                        })}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              <div className="hidden sm:flex items-center gap-1 flex-wrap">
                {activeNote.tags.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setNoteTags(activeNote.id, activeNote.tags.filter(v => v !== tag))}
                    title={`Remove ${tag}`}
                    className="group font-mono text-2xs text-fountain hover:text-pencil transition-colors"
                  >
                    #{tag.toLowerCase()}<span className="opacity-0 group-hover:opacity-100"> ×</span>
                  </button>
                ))}
                {tagInputOpen ? (
                  <form onSubmit={submitTag} className="flex items-center">
                    <input
                      autoFocus
                      value={tagValue}
                      onChange={e => setTagValue(e.target.value)}
                      onBlur={() => setTagInputOpen(false)}
                      placeholder="tag"
                      className="w-16 font-mono text-2xs bg-paper-dim border-0 rounded-sm px-1.5 py-0.5 focus:ring-0"
                    />
                  </form>
                ) : (
                  <button
                    type="button"
                    aria-label="Add tag"
                    onClick={() => setTagInputOpen(true)}
                    className="w-5 h-5 flex items-center justify-center rounded-sm text-ink-ghost hover:text-ink hover:bg-paper-dim transition-colors"
                  >
                    <Plus className="w-3 h-3" strokeWidth={2} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <SaveIndicator state={saveState} />
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(open => !open)}
                  aria-label="Note actions"
                  className="w-8 h-8 flex items-center justify-center rounded text-ink-faint hover:text-ink hover:bg-paper-dim transition-colors"
                >
                  <MoreHorizontal className="w-4 h-4" strokeWidth={1.75} />
                </button>
                <AnimatePresence>
                  {menuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.12 }}
                        className="absolute right-0 top-full mt-1 z-50 w-56 bg-paper border border-line rounded shadow-pop py-1"
                      >
                        <MenuItem icon={Pin} label={activeNote.isPinned ? 'Unpin' : 'Pin to top'} onClick={() => { togglePin(activeNote.id); setMenuOpen(false); }} />
                        <MenuItem icon={Copy} label="Carbon copy" onClick={() => { duplicateNote(activeNote.id); setMenuOpen(false); }} />
                        <MenuItem icon={Link2} label="Link to a note…" onClick={() => { setMenuOpen(false); setLinkPickerOpen(true); }} />
                        <MenuItem icon={Stamp} label="Stamp the date" onClick={stampDate} />
                        <div className="h-px bg-line my-1" />
                        <MenuItem
                          icon={History}
                          label={`Earlier drafts${noteDrafts.length ? ` · ${noteDrafts.length}` : ''}`}
                          onClick={() => { setMenuOpen(false); setDraftPreview(0); setDraftsOpen(true); }}
                        />
                        <MenuItem icon={FileDown} label="Export as Markdown" onClick={() => { downloadFile(`${slugify(activeNote.title)}.md`, noteToMarkdown(activeNote)); setMenuOpen(false); }} />
                        <MenuItem icon={Printer} label="Print the page" onClick={() => { setMenuOpen(false); window.print(); }} />
                        <div className="h-px bg-line my-1" />
                        <MenuItem icon={Trash2} label="Move to trash" danger onClick={() => {
                          const id = activeNote.id;
                          setMenuOpen(false);
                          setCrumpling(true);
                          // The sheet crumples into the basket, then the store drops it.
                          // Always reset — trashing may not unmount the sheet if
                          // another note is picked up straight away.
                          setTimeout(() => { trashNote(id); setCrumpling(false); }, 460);
                        }} />
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* The page */}
          <div ref={scrollRef} onScroll={trackScroll} className={clsx('flex-1 overflow-y-auto custom-scrollbar', editorClasses)}>
            <div className="max-w-[42rem] mx-auto w-full px-6 md:px-10 pt-10 pb-40">
              <div className="relative">
                {dropLanded && <span className="absolute -left-1 -top-3"><InkDrop seed={activeNote.id} size={30} color={pen.color} /></span>}
                <input
                  className="w-full font-serif text-[2.1rem] md:text-[2.4rem] font-semibold border-none focus:ring-0 p-0 mb-1 placeholder:text-ink-ghost/50 leading-[1.15] tracking-[-0.015em] bg-transparent"
                  style={{ color: 'var(--pen)' }}
                  type="text"
                  value={activeNote.title}
                  onChange={e => { updateNote(activeNote.id, { title: e.target.value }); triggerSave(); }}
                  placeholder="Untitled"
                  aria-label="Note title"
                />
                <Squiggle key={activeNote.id} seed={`title:${activeNote.id}`} width={180} color={pen.color} className="block opacity-60 mb-3" draw />
              </div>

              <div className="flex items-center gap-x-4 gap-y-1 mb-8 font-mono text-2xs text-ink-ghost flex-wrap">
                <span>{now - activeNote.lastModified < 8 * 60 * 1000 ? 'still wet' : `edited ${formatDistanceToNow(activeNote.lastModified, { addSuffix: true })}`}</span>
                <span>{activeNote.wordCount || 0} words</span>
                <span>{Math.max(1, Math.ceil((activeNote.wordCount || 0) / 220))} min read</span>
                <span>written {format(activeNote.createdAt, 'MMM d')}</span>
                {noteDrafts.length > 0 && (
                  <button
                    onClick={() => { setDraftPreview(0); setDraftsOpen(true); }}
                    className="text-fountain hover:text-ink transition-colors"
                  >
                    {noteDrafts.length} earlier {noteDrafts.length === 1 ? 'draft' : 'drafts'}
                  </button>
                )}
              </div>

              <RichEditor
                key={activeNote.id}
                onEditorReady={setEditor}
                content={activeNote.content}
                onUpdate={handleContentUpdate}
                placeholder="Begin."
              />
            </div>
          </div>

          {/* How deep the ink has run — a reading-depth trace on the sheet's edge */}
          <div className="ink-depth hidden md:block"><span ref={depthRef} style={{ height: '0%' }} /></div>

          {/* Backlinks — bottom-left drawer, only when they exist */}
          <AnimatePresence>
            {backlinks.length > 0 && (
              <BacklinksTray backlinks={backlinks} onOpen={id => { setActiveNote(id); }} />
            )}
          </AnimatePresence>

          {/* Earlier drafts — the blotter remembers what the page used to say */}
          <AnimatePresence>
            {draftsOpen && (
              <DraftsDrawer
                drafts={noteDrafts}
                preview={draftPreview}
                onPreview={setDraftPreview}
                onRestore={(i) => {
                  const draft = noteDrafts[i];
                  restoreDraft(activeNote.id, noteDrafts.length - 1 - i);
                  // The editor keeps its own document — swap it for the
                  // restored impression or the next keystroke overwrites it.
                  if (draft) editor?.commands.setContent(sanitizeDoc(draft.content));
                  setDraftsOpen(false);
                  // The blotter presses the old words back onto the page.
                  setPressing(true);
                  setTimeout(() => setPressing(false), 600);
                }}
                onClose={() => setDraftsOpen(false)}
              />
            )}
          </AnimatePresence>

          {/* Link picker popover */}
          <AnimatePresence>
            {linkPickerOpen && (
              <>
                <div className="fixed inset-0 z-[70]" onClick={() => setLinkPickerOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[71] w-72 bg-paper border border-line rounded shadow-pop overflow-hidden"
                >
                  <p className="px-3.5 pt-3 pb-1.5 text-[11px] font-medium text-ink-ghost">Link to a note — inserts [[title]]</p>
                  <div className="max-h-56 overflow-y-auto pb-1.5 custom-scrollbar">
                    {liveNotes.length === 0 && <p className="px-3.5 py-2 text-[13px] text-ink-faint">No other notes yet.</p>}
                    {liveNotes.map(note => (
                      <button
                        key={note.id}
                        onClick={() => insertWikiLink(note.title || 'Untitled')}
                        className="w-full text-left px-3.5 py-2 text-[13px] font-serif text-ink hover:bg-paper-dim truncate transition-colors"
                      >
                        {note.title || 'Untitled'}
                      </button>
                    ))}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* A few flecks the nib threw, dried into the corner */}
          <Spatter seed={activeNote.id} size={90} className="absolute bottom-24 right-6 md:right-10 pointer-events-none z-[2]" opacity={0.28} />

          {/* Ink toolbar — rises as the sheet is picked up */}
          <div key={activeNote.id} className="inkbar absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-0.5 px-1.5 py-1.5 bg-ink rounded-md shadow-pop z-30 max-w-[calc(100vw-2rem)] overflow-x-auto scrollbar-none">
            <ToolbarButton editor={editor} icon="undo" title="Undo" onAction={e => e.chain().focus().undo().run()} />
            <ToolbarButton editor={editor} icon="redo" title="Redo" onAction={e => e.chain().focus().redo().run()} />
            <div className="w-px h-4 bg-paper/15 mx-1 flex-shrink-0" />
            <ToolbarButton editor={editor} icon="format_bold" title="Bold" onAction={e => e.chain().focus().toggleBold().run()} />
            <ToolbarButton editor={editor} icon="format_italic" title="Italic" onAction={e => e.chain().focus().toggleItalic().run()} />
            <ToolbarButton editor={editor} icon="highlight" title="Mark it" onAction={e => e.chain().focus().toggleHighlight().run()} />
            <ToolbarButton editor={editor} icon="underline" title="Underline" onAction={e => e.chain().focus().toggleUnderline().run()} />
            <div className="w-px h-4 bg-paper/15 mx-1 flex-shrink-0" />
            <ToolbarButton editor={editor} icon="format_list_bulleted" title="List" onAction={e => e.chain().focus().toggleBulletList().run()} />
            <ToolbarButton editor={editor} icon="format_quote" title="Quote" onAction={e => e.chain().focus().toggleBlockquote().run()} />
            <ToolbarButton editor={editor} icon="code" title="Code" onAction={e => e.chain().focus().toggleCode().run()} />
            <div className="w-px h-4 bg-paper/15 mx-1 flex-shrink-0" />
            <button
              type="button"
              title="Stamp the date"
              aria-label="Stamp the date"
              onClick={stampDate}
              disabled={!editor}
              className="w-8 h-8 rounded-sm flex items-center justify-center text-paper/60 hover:text-paper hover:bg-paper/10 disabled:opacity-30 transition-colors flex-shrink-0"
            >
              <Stamp className="w-4 h-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              title="Link to a note"
              aria-label="Link to a note"
              onClick={() => setLinkPickerOpen(true)}
              className="w-8 h-8 rounded-sm flex items-center justify-center text-paper/60 hover:text-paper hover:bg-paper/10 transition-colors flex-shrink-0"
            >
              <Link2 className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>
        </section>
      )}

      {/* The page, set plainly for paper — only exists when printing */}
      {activeNote && createPortal(
        <div className="print-page" aria-hidden>
          <h1>{activeNote.title || 'Untitled'}</h1>
          <PrintDoc content={activeNote.content} />
          <p className="print-colophon">
            {pen.name} · {activeNote.wordCount || 0} words · written {format(activeNote.createdAt, 'MMMM d, yyyy')} · Ink — a writing desk
          </p>
        </div>,
        document.body
      )}
    </div>
  );
};

/* ── Earlier drafts ───────────────────────────────────────────── */

const DraftsDrawer: React.FC<{
  drafts: Draft[]; // newest first
  preview: number;
  onPreview: (i: number) => void;
  onRestore: (i: number) => void;
  onClose: () => void;
}> = ({ drafts, preview, onPreview, onRestore, onClose }) => {
  const shown = drafts[preview];
  return (
    <>
      <div className="absolute inset-0 z-[72] bg-ink/15" onClick={onClose} />
      <motion.aside
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 16 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        role="dialog"
        aria-modal="true"
        aria-label="Earlier drafts"
        className="absolute right-0 top-0 bottom-0 z-[73] w-full sm:w-[380px] bg-paper border-l border-line shadow-lift flex flex-col"
      >
        <div className="px-5 pt-5 pb-3 border-b border-line flex items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-lg font-semibold text-ink">Earlier drafts</h3>
            <p className="font-mono text-2xs text-ink-ghost mt-0.5">
              the blotter keeps the last twelve impressions
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close drafts"
            className="w-7 h-7 flex items-center justify-center rounded text-ink-ghost hover:text-ink hover:bg-paper-dim transition-colors -mr-1.5 -mt-1 text-lg leading-none"
          >
            ×
          </button>
        </div>

        {drafts.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2.5 px-8 text-center">
            <PenRest className="w-24 h-12 opacity-80" />
            <p className="font-serif text-[15px] text-ink-faint">One draft so far — this one.</p>
            <p className="text-2xs font-mono text-ink-ghost leading-relaxed">
              keep writing; earlier versions of the page settle here as it changes
            </p>
          </div>
        ) : (
          <>
            {/* The impression being examined */}
            {shown && (
              <div className="flex-1 min-h-0 flex flex-col border-b border-line">
                <div className="px-5 pt-4 pb-2 flex items-baseline justify-between gap-3">
                  <p className="font-serif font-semibold text-[15px] text-ink truncate">{shown.title || 'Untitled'}</p>
                  <span className="font-mono text-2xs text-ink-ghost flex-shrink-0 tabular-nums">
                    {formatDistanceToNow(shown.savedAt, { addSuffix: true })} · {shown.wordCount}w
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar px-5 pb-4">
                  <div className="bg-paper-dim/60 border border-line rounded-sm px-4 py-3">
                    <PrintDoc content={shown.content} />
                  </div>
                </div>
                <div className="px-5 pb-4 pt-1">
                  <button
                    onClick={() => onRestore(preview)}
                    className="w-full flex items-center justify-center gap-2 bg-ink text-paper text-[13px] font-medium py-2 rounded hover:bg-ink-soft transition-colors"
                  >
                    <Undo2 className="w-3.5 h-3.5" strokeWidth={2} />
                    Press this back onto the page
                  </button>
                </div>
              </div>
            )}

            {/* The stack of slips */}
            <div className="max-h-[38%] overflow-y-auto custom-scrollbar py-1">
              {drafts.map((draft, i) => (
                <button
                  key={`${draft.savedAt}-${i}`}
                  onClick={() => onPreview(i)}
                  className={clsx(
                    'relative w-full text-left pl-5 pr-5 py-2.5 transition-colors',
                    i === preview ? 'bg-paper-dim' : 'hover:bg-paper-dim/60'
                  )}
                >
                  {i === preview && <span className="margin-mark" style={{ left: 2 }} />}
                  <span className="block font-serif text-[13px] font-medium text-ink truncate">
                    {draft.title || 'Untitled'}
                  </span>
                  <span className="block font-mono text-2xs text-ink-ghost tabular-nums mt-0.5">
                    {format(draft.savedAt, 'MMM d, h:mm a')} · {draft.wordCount} words
                  </span>
                  <span className="block font-serif text-[12px] text-ink-faint truncate mt-0.5 opacity-80">
                    {extractText(draft.content, 80) || 'A blank page.'}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </motion.aside>
    </>
  );
};

/* ── PrintDoc — a note's JSON rendered plainly, for paper and previews ── */

const PrintInline: React.FC<{ node: TipTapNode }> = ({ node }) => {
  if (node.type === 'hardBreak') return <br />;
  if (node.type !== 'text' || !node.text) {
    return <>{node.content?.map((child, i) => <PrintInline key={i} node={child} />)}</>;
  }
  let out: React.ReactNode = node.text;
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') out = <strong>{out}</strong>;
    else if (mark.type === 'italic') out = <em>{out}</em>;
    else if (mark.type === 'strike') out = <s>{out}</s>;
    else if (mark.type === 'code') out = <code>{out}</code>;
    else if (mark.type === 'highlight') out = <mark>{out}</mark>;
    else if (mark.type === 'underline') out = <u>{out}</u>;
  }
  return <>{out}</>;
};

const PrintBlock: React.FC<{ node: TipTapNode }> = ({ node }) => {
  const kids = (node.content ?? []).map((child, i) => <PrintBlock key={i} node={child} />);
  const inline = (node.content ?? []).map((child, i) => <PrintInline key={i} node={child} />);
  switch (node.type) {
    case 'heading': {
      const level = node.attrs?.level ?? 2;
      if (level === 1) return <h1 className="font-serif font-semibold text-[1.35em] text-ink mt-4 mb-1">{inline}</h1>;
      if (level === 3) return <h3 className="font-serif font-semibold text-ink-soft mt-3 mb-0.5">{inline}</h3>;
      return <h2 className="font-serif font-semibold text-[1.15em] text-ink mt-4 mb-1">{inline}</h2>;
    }
    case 'blockquote':
      return <blockquote className="border-l-2 border-pencil pl-3 my-2 italic text-ink-faint">{kids}</blockquote>;
    case 'bulletList':
      return <ul className="list-disc pl-5 my-1.5">{kids}</ul>;
    case 'orderedList':
      return <ol className="list-decimal pl-5 my-1.5">{kids}</ol>;
    case 'listItem':
      return <li>{kids}</li>;
    case 'codeBlock':
      return <pre className="font-mono text-[11px] leading-relaxed bg-ink text-paper/90 rounded p-3 my-2 overflow-x-auto whitespace-pre-wrap">{node.content?.map(c => c.text ?? '').join('')}</pre>;
    case 'horizontalRule':
      return <p className="print-asterism text-center tracking-[0.35em] text-ink-ghost my-4">⁂</p>;
    case 'paragraph':
    default:
      return <p className="font-serif text-[13.5px] leading-relaxed text-ink-soft mb-2">{inline}</p>;
  }
};

export const PrintDoc: React.FC<{ content: string }> = ({ content }) => {
  const doc = sanitizeDoc(content);
  return <>{doc.content?.map((node, i) => <PrintBlock key={i} node={node} />)}</>;
};

/* ── Small parts ──────────────────────────────────────────────── */

const MenuItem: React.FC<{ icon: React.ElementType; label: string; onClick: () => void; danger?: boolean }> = ({ icon: Icon, label, onClick, danger }) => (
  <button
    onClick={onClick}
    className={clsx(
      'w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors',
      danger ? 'text-pencil hover:bg-pencil-wash' : 'text-ink-soft hover:bg-paper-dim hover:text-ink'
    )}
  >
    <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
    {label}
  </button>
);

const BacklinksTray: React.FC<{ backlinks: { id: string; title: string; ink?: PenId }[]; onOpen: (id: string) => void }> = ({ backlinks, onOpen }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute bottom-5 left-5 z-30 hidden md:block">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-2xs font-mono text-ink-faint bg-paper border border-line rounded px-2.5 py-1.5 hover:text-ink transition-colors shadow-sm"
      >
        <CornerLeftUp className="w-3 h-3" strokeWidth={1.75} />
        {backlinks.length} {backlinks.length === 1 ? 'link' : 'links'} here
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 mb-1.5 w-64 bg-paper border border-line rounded shadow-pop overflow-hidden"
          >
            <p className="px-3.5 pt-3 pb-1.5 text-[11px] font-medium text-ink-ghost">Mentioned in</p>
            <div className="pb-1.5 max-h-52 overflow-y-auto custom-scrollbar">
              {backlinks.map(note => (
                <button
                  key={note.id}
                  onClick={() => onOpen(note.id)}
                  className="w-full flex items-center gap-2 text-left px-3.5 py-2 text-[13px] font-serif text-ink hover:bg-paper-dim transition-colors"
                >
                  <InkBlot seed={note.id} size={10} satellites={0} color={penOf(note.ink).color} opacity={0.7} className="flex-shrink-0" />
                  <span className="truncate">{note.title || 'Untitled'}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ToolbarButton: React.FC<{
  editor: TiptapEditor | null;
  icon: string;
  title: string;
  onAction: (editor: TiptapEditor) => void;
}> = ({ editor, icon, title, onAction }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    disabled={!editor}
    onMouseDown={event => event.preventDefault()}
    onClick={() => editor && onAction(editor)}
    className="w-8 h-8 rounded-sm flex items-center justify-center text-paper/60 hover:text-paper hover:bg-paper/10 disabled:opacity-30 transition-colors flex-shrink-0"
  >
    <ToolbarGlyph icon={icon} />
  </button>
);

// Tiny inline glyphs, hand-drawn weight — no icon font needed in the toolbar.
const ToolbarGlyph: React.FC<{ icon: string }> = ({ icon }) => {
  const props = { className: 'w-4 h-4', strokeWidth: 2, fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (icon) {
    case 'undo':
      return <Undo2 className="w-4 h-4" strokeWidth={1.75} />;
    case 'redo':
      return <Redo2 className="w-4 h-4" strokeWidth={1.75} />;
    case 'highlight':
      return <Highlighter className="w-4 h-4" strokeWidth={1.75} />;
    case 'underline':
      return <Underline className="w-4 h-4" strokeWidth={1.75} />;
    case 'format_bold':
      return <span className="font-serif font-bold text-[15px] leading-none">B</span>;
    case 'format_italic':
      return <span className="font-serif italic text-[15px] leading-none">I</span>;
    case 'format_list_bulleted':
      return <svg viewBox="0 0 24 24" {...props}><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="3.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="3.5" cy="18" r="1.3" fill="currentColor" stroke="none"/></svg>;
    case 'format_quote':
      return <span className="font-serif font-bold text-[17px] leading-none -mt-0.5">”</span>;
    case 'code':
      return <svg viewBox="0 0 24 24" {...props}><path d="m8 8-4 4 4 4M16 8l4 4-4 4"/></svg>;
    default:
      return null;
  }
};

const SaveIndicator: React.FC<{ state: SaveState }> = ({ state }) => (
  <AnimatePresence mode="wait">
    {state === 'saving' && (
      <motion.span
        key="saving"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex items-center gap-1.5 font-mono text-2xs text-ink-ghost pr-1"
      >
        <motion.span
        className="w-1.5 h-1.5 rounded-full bg-fountain"
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ repeat: Infinity, duration: 0.9 }}
      />
      ink wet
    </motion.span>
    )}
    {state === 'saved' && (
      <motion.span
        key="saved"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex items-center gap-1 font-mono text-2xs text-ink-ghost pr-1"
      >
        <Droplet className="w-3 h-3 text-ink-ghost" strokeWidth={2.5} />
        ink dry
      </motion.span>
    )}
  </AnimatePresence>
);
