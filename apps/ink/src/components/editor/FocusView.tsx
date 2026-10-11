import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store';
import { RichEditor } from '../editor/RichEditor';
import { getNoteIndex, findBacklinksIndexed } from '../../lib/notes';
import { formatDistanceToNow, format } from 'date-fns';
import type { Editor as TiptapEditor } from '@tiptap/react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  Bold, Italic, List, Quote, Code, Pilcrow, Timer, X, Trash2, ArrowLeft,
} from 'lucide-react';
import { PenRest, Squiggle } from '../../lib/ink';
import { penOf } from '../../lib/pens';

const TIMER_OPTIONS = [15, 25, 50];

export const FocusView: React.FC = () => {
  const { activeNoteId, notes, updateNote, updateNoteFolder, folders, trashNote, removeNoteTag, setActiveNote, prefs, setPrefs, setNotice } = useStore();
  const activeNote = notes.find(n => n.id === activeNoteId && !n.trashedAt);
  const [editor, setEditor] = useState<TiptapEditor | null>(null);
  const [focusMinutes, setFocusMinutes] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const typewriter = prefs.typewriter;
  const [sessionStart, setSessionStart] = useState<{ id: string | null; words: number }>({ id: null, words: 0 });
  const navigate = useNavigate();

  // Snapshot the word count when a different note is opened (derived-state pattern).
  if (activeNote && sessionStart.id !== activeNote.id) {
    setSessionStart({ id: activeNote.id, words: activeNote.wordCount });
  }

  useEffect(() => {
    if (focusMinutes === null || remainingSeconds <= 0) return;
    const timeout = window.setTimeout(() => setRemainingSeconds(s => s - 1), 1000);
    return () => window.clearTimeout(timeout);
  }, [focusMinutes, remainingSeconds]);

  useEffect(() => {
    if (remainingSeconds === 0 && focusMinutes !== null) {
      setFocusMinutes(null);
      // The timer ran dry — say so on the desk, not just in the rail.
      setNotice({ message: `${focusMinutes} minutes of ink — stretch, then dip again` });
    }
  }, [remainingSeconds, focusMinutes, setNotice]);

  const sessionDelta = Math.max(0, (activeNote?.wordCount ?? 0) - sessionStart.words);

  const startFocus = (minutes: number) => {
    setFocusMinutes(minutes);
    setRemainingSeconds(minutes * 60);
  };

  const timerLabel = `${Math.floor(remainingSeconds / 60).toString().padStart(2, '0')}:${(remainingSeconds % 60).toString().padStart(2, '0')}`;

  const outline = useMemo<{ id: string; level: number; text: string }[]>(() => {
    if (!activeNote) return [];
    try {
      const doc = JSON.parse(activeNote.content);
      let i = 0;
      return (doc.content ?? [])
        .filter((node: { type: string }) => node.type === 'heading')
        .map((node: { attrs?: { level?: number }; content?: { text?: string }[] }) => ({
          id: `focus-heading-${i++}`,
          level: node.attrs?.level ?? 1,
          text: node.content?.map(part => part.text ?? '').join('') || 'Untitled section',
        }));
    } catch {
      return [];
    }
  }, [activeNote]);

  const noteIndex = useMemo(() => getNoteIndex(notes), [notes]);
  const backlinks = useMemo(
    () => (activeNote ? findBacklinksIndexed(notes, noteIndex, activeNote.title || '') : []),
    [notes, noteIndex, activeNote]
  );

  const moveToHeading = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <AnimatePresence mode="wait">
      {!activeNote ? (
        <motion.div
          key="empty"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex-1 flex flex-col items-center justify-center gap-3 bg-desk"
        >
          <PenRest className="w-32 h-16 opacity-80" />
          <p className="font-serif text-xl text-ink-faint">Nothing on the desk.</p>
          <button onClick={() => navigate('/')} className="text-[13px] font-medium text-pencil hover:text-pencil-deep transition-colors">
            Choose a note to work on
          </button>
        </motion.div>
      ) : (
        <motion.div
          key={activeNote.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="flex-1 flex overflow-hidden"
        >
          {/* Left rail — map & references */}
          <aside className="hidden xl:flex flex-col w-60 h-full border-r border-line p-5 overflow-y-auto custom-scrollbar flex-shrink-0">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-1.5 text-[11px] font-medium text-ink-faint hover:text-ink transition-colors mb-6 -ml-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.75} />
              Back to the desk
            </button>

            <h2 className="text-[11px] font-medium text-ink-ghost mb-2.5">On this page</h2>
            <nav className="flex flex-col gap-px mb-8">
              {outline.length === 0 && (
                <p className="text-xs text-ink-ghost leading-relaxed">No headings yet. Add one and it will appear here.</p>
              )}
              {outline.map(item => (
                <button
                  key={item.id}
                  onClick={() => moveToHeading(item.id)}
                  className={clsx(
                    'text-left py-1.5 px-2 rounded text-[12.5px] font-serif text-ink-soft hover:bg-paper-dim transition-colors',
                    item.level > 1 && 'ml-3 text-ink-faint'
                  )}
                >
                  {item.text}
                </button>
              ))}
            </nav>

            <h2 className="text-[11px] font-medium text-ink-ghost mb-2.5">Linked from</h2>
            <div className="space-y-1">
              {backlinks.length === 0 && (
                <p className="text-xs text-ink-ghost leading-relaxed">
                  No notes point here yet. Reference this note elsewhere with [[{activeNote.title || 'its title'}]].
                </p>
              )}
              {backlinks.map(note => (
                <button
                  key={note.id}
                  onClick={() => setActiveNote(note.id)}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-paper-dim transition-colors"
                >
                  <p className="text-[12.5px] font-serif font-medium text-ink truncate">{note.title || 'Untitled'}</p>
                  <p className="text-2xs font-mono text-ink-ghost">{note.folder}</p>
                </button>
              ))}
            </div>
          </aside>

          {/* Manuscript */}
          <main className="flex-1 flex flex-col items-center overflow-y-auto bg-paper custom-scrollbar">
            <article className="max-w-[40rem] w-full px-6 lg:px-10 pt-14 pb-40">
              <div className="flex items-center gap-2 mb-8 font-mono text-2xs text-ink-ghost">
                <span>deep work</span>
                <span aria-hidden>·</span>
                <span style={{ color: penOf(activeNote.ink).color }}>{penOf(activeNote.ink).name}</span>
                <span aria-hidden>·</span>
                <select
                  aria-label="Move note to folder"
                  value={activeNote.folder}
                  onChange={event => updateNoteFolder(activeNote.id, event.target.value)}
                  className="bg-transparent border-0 py-0 pr-4 pl-0 font-mono text-2xs text-ink-ghost focus:ring-0 cursor-pointer hover:text-ink"
                >
                  {folders.map(folder => <option key={folder.id} value={folder.name}>{folder.name}</option>)}
                  {!folders.some(folder => folder.name === activeNote.folder) && <option value={activeNote.folder}>{activeNote.folder}</option>}
                </select>
                <span aria-hidden>·</span>
                <span>{format(activeNote.createdAt, 'MMM d, yyyy')}</span>
              </div>

              <input
                aria-label="Note title"
                value={activeNote.title}
                onChange={event => updateNote(activeNote.id, { title: event.target.value })}
                placeholder="Untitled"
                className="w-full border-0 bg-transparent p-0 font-serif text-[2.5rem] font-semibold mb-1 leading-[1.12] tracking-[-0.015em] placeholder:text-ink-ghost/50 focus:ring-0"
                style={{ color: penOf(activeNote.ink).color }}
              />
              <Squiggle key={activeNote.id} seed={`focus-title:${activeNote.id}`} width={200} color={penOf(activeNote.ink).color} className="block opacity-50 mb-4" draw />

              <div className="flex items-center gap-x-4 gap-y-1 mb-10 font-mono text-2xs text-ink-ghost flex-wrap">
                <span>edited {formatDistanceToNow(activeNote.lastModified, { addSuffix: true })}</span>
                <span>{activeNote.wordCount || 0} words</span>
                {activeNote.tags.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => removeNoteTag(activeNote.id, t)}
                    title={`Remove ${t}`}
                    className="text-fountain hover:text-pencil transition-colors"
                  >
                    #{t.toLowerCase()}
                  </button>
                ))}
              </div>

              <div className={clsx('focus-prose', prefs.editorTextSize !== 'md' && `pref-text-${prefs.editorTextSize}`)}>
                <RichEditor
                  key={activeNote.id}
                  onEditorReady={setEditor}
                  headingAnchors
                  typewriter={typewriter}
                  content={activeNote.content}
                  onUpdate={(json, wordCount) => updateNote(activeNote.id, { content: json, wordCount })}
                  placeholder="Begin."
                />
              </div>
            </article>
          </main>

          {/* Right rail — the colophon */}
          <aside className="hidden xl:flex flex-col w-60 h-full border-l border-line p-5 overflow-y-auto custom-scrollbar flex-shrink-0">
            <h2 className="text-[11px] font-medium text-ink-ghost mb-4">Colophon</h2>
            <dl className="space-y-4">
              <Prop label="Words" value={`${activeNote.wordCount || 0}`} />
              <Prop label="This session" value={sessionDelta > 0 ? `+${sessionDelta}` : '—'} />
              <Prop label="Reading time" value={`${Math.max(1, Math.ceil((activeNote.wordCount || 0) / 220))} min`} />
              <Prop label="Folder" value={activeNote.folder} />
              <Prop label="Pinned" value={activeNote.isPinned ? 'Yes' : 'No'} />
            </dl>
            <div className="mt-auto pt-8">
              <p className="text-2xs text-ink-ghost leading-relaxed font-mono">
                Ink keeps everything on this device. Export regularly from Settings.
              </p>
            </div>
          </aside>

          {/* Ink bar */}
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-ink rounded-md shadow-pop px-1.5 py-1.5 flex items-center gap-0.5 z-50 max-w-[calc(100vw-2rem)] overflow-x-auto scrollbar-none">
            <FocusToolBtn title="Bold" editor={editor} onClick={() => editor?.chain().focus().toggleBold().run()} icon={Bold} />
            <FocusToolBtn title="Italic" editor={editor} onClick={() => editor?.chain().focus().toggleItalic().run()} icon={Italic} />
            <FocusToolBtn title="List" editor={editor} onClick={() => editor?.chain().focus().toggleBulletList().run()} icon={List} />
            <FocusToolBtn title="Quote" editor={editor} onClick={() => editor?.chain().focus().toggleBlockquote().run()} icon={Quote} />
            <FocusToolBtn title="Code" editor={editor} onClick={() => editor?.chain().focus().toggleCode().run()} icon={Code} />
            <span className="w-px h-4 bg-paper/15 mx-1 flex-shrink-0" />
            <button
              type="button"
              onClick={() => setPrefs({ typewriter: !typewriter })}
              title="Typewriter mode — dim all but the current paragraph"
              aria-pressed={typewriter}
              className={clsx(
                'w-8 h-8 rounded-sm flex items-center justify-center transition-colors flex-shrink-0',
                typewriter ? 'bg-paper/15 text-paper' : 'text-paper/55 hover:text-paper hover:bg-paper/10'
              )}
            >
              <Pilcrow className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
            <span className="w-px h-4 bg-paper/15 mx-1 flex-shrink-0" />
            {focusMinutes ? (
              <span className="flex items-center gap-2 px-2 text-paper text-xs font-mono tabular-nums flex-shrink-0">
                <Timer className="w-3.5 h-3.5" strokeWidth={1.75} />
                {timerLabel}
                <button onClick={() => { setFocusMinutes(null); setRemainingSeconds(0); }} aria-label="Stop timer" className="text-paper/50 hover:text-paper">
                  <X className="w-3 h-3" strokeWidth={2} />
                </button>
              </span>
            ) : (
              <span className="flex items-center gap-0.5 px-1 flex-shrink-0">
                {TIMER_OPTIONS.map(min => (
                  <button
                    key={min}
                    onClick={() => startFocus(min)}
                    className="px-2 py-1 rounded-sm font-mono text-2xs text-paper/60 hover:text-paper hover:bg-paper/10 transition-colors"
                  >
                    {min}m
                  </button>
                ))}
              </span>
            )}
            <span className="w-px h-4 bg-paper/15 mx-1 flex-shrink-0" />
            <button
              type="button"
              onClick={() => trashNote(activeNote.id)}
              title="Move to trash"
              aria-label="Move to trash"
              className="w-8 h-8 rounded-sm flex items-center justify-center text-paper/55 hover:text-pencil-wash hover:bg-paper/10 transition-colors flex-shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const Prop = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col gap-0.5">
    <dt className="text-[11px] font-medium text-ink-ghost">{label}</dt>
    <dd className="font-mono text-sm text-ink">{value}</dd>
  </div>
);

const FocusToolBtn: React.FC<{ icon: React.ElementType; title: string; editor: TiptapEditor | null; onClick: () => void }> = ({ icon: Icon, title, editor, onClick }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    disabled={!editor}
    onMouseDown={event => event.preventDefault()}
    onClick={onClick}
    className="w-8 h-8 rounded-sm flex items-center justify-center text-paper/55 hover:text-paper hover:bg-paper/10 disabled:opacity-30 transition-colors flex-shrink-0"
  >
    <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
  </button>
);
