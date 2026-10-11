import React, { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import type { ResolvedPos } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import Typography from '@tiptap/extension-typography';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import clsx from 'clsx';
import {
  Bold, Italic, Strikethrough, Code, List, ListOrdered, Quote,
  Heading1, Heading2, Highlighter, Underline as UnderlineIcon,
} from 'lucide-react';
import { useStore } from '../../store';
import { sanitizeDoc } from '../../lib/notes';
import { InkBlot, PenNib } from '../../lib/ink';
import { penOf, type PenId } from '../../lib/pens';

const WIKILINK_RE = /\[\[([^\][\n]+)\]\]/g;

/** Fresh keystrokes land wet — diluted and blurred — then dry into the page. */
const inkDryingPlugin: Plugin = new Plugin({
  key: new PluginKey('inkDrying'),
  state: {
    init: () => DecorationSet.empty,
    apply(tr, set) {
      set = set.map(tr.mapping, tr.doc);
      if (!tr.docChanged || !useStore.getState().prefs.wetInk) return set;
      const fresh: Decoration[] = [];
      tr.steps.forEach((step, i) => {
        step.getMap().forEach((_oldStart, _oldEnd, newStart, newEnd) => {
          // Only small bursts count as "written" — a paste or import lands dry.
          if (newEnd - newStart === 0 || newEnd - newStart > 42) return;
          const rest = tr.mapping.slice(i + 1);
          const from = rest.map(newStart, -1);
          const to = rest.map(newEnd, 1);
          if (to <= from || to > tr.doc.content.size) return;
          try {
            if (!/\S/.test(tr.doc.textBetween(from, to))) return;
            fresh.push(Decoration.inline(from, to, { class: 'ink-wet' }));
          } catch { /* range raced with a later step — skip it */ }
        });
      });
      if (fresh.length) set = set.add(tr.doc, fresh);
      const all = set.find();
      if (all.length > 160) set = set.remove(all.slice(0, all.length - 160));
      return set;
    },
  },
  props: {
    decorations(state: EditorState): DecorationSet {
      return inkDryingPlugin.getState(state);
    },
  },
});

const InkDrying = Extension.create({
  name: 'inkDrying',
  addProseMirrorPlugins() {
    return [inkDryingPlugin];
  },
});

/* The caret's position measured in characters of the textblock's flat
 * textContent — doc positions count leaf nodes (a hardBreak takes one)
 * that textContent skips, so text lookups need the translation. */
const caretTextOffset = ($pos: ResolvedPos): number => {
  let textOffset = 0;
  $pos.parent.forEach((child, childOffset) => {
    if (childOffset < $pos.parentOffset && child.isText && child.text) {
      textOffset += Math.min(child.text.length, $pos.parentOffset - childOffset);
    }
  });
  return textOffset;
};

/* Is the caret inside an open `[[` — i.e. mid-link, no closing brackets yet?
 * Returns the doc range covering `[[query` so a pick can replace it whole. */
const openLinkAt = (editor: Editor): { from: number; to: number; query: string } | null => {
  const { $from, empty } = editor.state.selection;
  if (!empty || !$from.parent.isTextblock) return null;
  const textOffset = caretTextOffset($from);
  const before = $from.parent.textContent.slice(0, textOffset);
  const openIdx = before.lastIndexOf('[[');
  if (openIdx < 0) return null;
  const between = before.slice(openIdx + 2);
  if (between.includes(']') || between.includes('\n') || between.length > 80) return null;
  // Translate the textContent offset into a doc offset — only works when the
  // `[[` sits entirely inside one text node (it's not split by marks). A hard
  // break inside the link window also ends it: textContent can't see breaks,
  // so a `[[` on an earlier Shift+Enter line must not reach past the caret.
  const parentStart = $from.start();
  let t = 0;
  let from = -1;
  let crossedBreak = false;
  $from.parent.forEach((child, offset) => {
    if (!child.isText || !child.text) {
      // A break strictly inside the `[[`..caret window ends the link — but a
      // break the caret *touches* (same doc position) is beside it, not in it.
      // Text offsets can't tell those apart, so compare doc positions.
      if (t > openIdx && parentStart + offset < $from.pos) crossedBreak = true;
      return;
    }
    if (from < 0 && openIdx >= t && openIdx + 2 <= t + child.text.length) {
      from = parentStart + offset + (openIdx - t);
    }
    t += child.text.length;
  });
  if (from < 0 || crossedBreak) return null;
  return { from, to: $from.pos, query: between };
};

/** Renders [[note titles]] in fountain-blue and opens (or starts) the named page on click. */
const WikiLinks = Extension.create({
  name: 'wikiLinks',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('wikiLinks'),
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;
              WIKILINK_RE.lastIndex = 0;
              let match: RegExpExecArray | null;
              while ((match = WIKILINK_RE.exec(node.text))) {
                decorations.push(
                  Decoration.inline(pos + match.index, pos + match.index + match[0].length, { class: 'wikilink' })
                );
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
          handleClick(view, pos) {
            const $pos = view.state.doc.resolve(pos);
            if (!$pos.parent.isTextblock) return false;
            const textOffset = caretTextOffset($pos);
            WIKILINK_RE.lastIndex = 0;
            let match: RegExpExecArray | null;
            while ((match = WIKILINK_RE.exec($pos.parent.textContent))) {
              if (textOffset >= match.index && textOffset <= match.index + match[0].length) {
                const title = match[1].trim();
                const { notes, setActiveNote, addNote } = useStore.getState();
                const target = notes.find(n => !n.trashedAt && (n.title.trim() || 'Untitled').toLowerCase() === title.toLowerCase());
                if (target) setActiveNote(target.id);
                else addNote({ title });
                return true;
              }
            }
            return false;
          },
        },
      }),
    ];
  },
});

interface RichEditorProps {
  content: string;
  onUpdate: (json: string, wordCount: number) => void;
  placeholder?: string;
  editable?: boolean;
  className?: string;
  onEditorReady?: (editor: Editor | null) => void;
  headingAnchors?: boolean;
  typewriter?: boolean;
}

/** Tag top-level headings with focus-heading-N ids, matching the outline's
 *  document order. Nested headings (e.g. inside a blockquote) get no anchor —
 *  the outline doesn't list them either. */
const assignHeadingIds = (dom: HTMLElement) => {
  dom.querySelectorAll('h1, h2, h3').forEach(h => h.removeAttribute('id'));
  let index = 0;
  for (const el of Array.from(dom.children)) {
    if (/^H[1-3]$/.test(el.tagName)) el.id = `focus-heading-${index++}`;
  }
};

/** Tag the top-level block holding the caret so typewriter mode can dim the rest. */
const markCurrentBlock = (editor: Editor) => {
  const dom = editor.view.dom;
  dom.querySelectorAll('.is-current').forEach(el => el.classList.remove('is-current'));
  try {
    const resolved = editor.view.domAtPos(editor.state.selection.$from.pos);
    let node = (resolved.node.nodeType === 3 ? resolved.node.parentElement : resolved.node) as HTMLElement | null;
    while (node && node.parentElement !== dom) node = node.parentElement;
    node?.classList?.add('is-current');
  } catch {
    // selection outside doc — leave unmarked
  }
};

/* ── The [[ link suggester ─────────────────────────────────────
 * Typing [[ opens a shelf of pages under the caret; arrows pick,
 * Enter links, Esc cancels. Naming a page that doesn't exist yet
 * offers to start it — the blank page is filed, not opened, so the
 * sentence you're writing never loses its place. */

type SuggestItem = { id: string | 'new'; title: string; ink?: PenId };
type SuggestUI = { from: number; to: number; query: string; x: number; y: number; items: SuggestItem[]; index: number };

const linkItems = (query: string): SuggestItem[] => {
  const q = query.trim().toLowerCase();
  const live = useStore.getState().notes.filter(n => !n.trashedAt);
  const matches = live
    .filter(n => !q || (n.title || 'Untitled').toLowerCase().includes(q))
    .sort((a, b) => {
      // Prefix hits first — "rab" should offer "Rabbit holes" over "The rabbit season"
      const aPre = (a.title || 'Untitled').toLowerCase().startsWith(q) ? 0 : 1;
      const bPre = (b.title || 'Untitled').toLowerCase().startsWith(q) ? 0 : 1;
      return aPre - bPre || b.lastModified - a.lastModified;
    })
    .slice(0, 7)
    .map((n): SuggestItem => ({ id: n.id, title: n.title || 'Untitled', ink: n.ink }));
  const exact = live.some(n => (n.title || 'Untitled').trim().toLowerCase() === q);
  if (q && !exact) matches.unshift({ id: 'new', title: query.trim() });
  return matches;
};

export const RichEditor: React.FC<RichEditorProps> = ({
  content,
  onUpdate,
  placeholder = 'Begin.',
  editable = true,
  className = '',
  onEditorReady,
  headingAnchors = false,
  typewriter = false,
}) => {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [suggest, setSuggest] = useState<SuggestUI | null>(null);
  const suggestRef = useRef<SuggestUI | null>(null);
  // Editor callbacks are bound once at creation — read live values from a ref.
  const latest = useRef({ typewriter, headingAnchors, editable, onUpdate });
  useEffect(() => {
    latest.current = { typewriter, headingAnchors, editable, onUpdate };
  });

  const parsedContent = sanitizeDoc(content);

  const closeSuggest = () => {
    if (suggestRef.current) {
      suggestRef.current = null;
      setSuggest(null);
    }
  };

  const refreshSuggest = (editor: Editor) => {
    const open = latest.current.editable ? openLinkAt(editor) : null;
    if (!open) { closeSuggest(); return; }
    const items = linkItems(open.query);
    const coords = editor.view.coordsAtPos(open.from);
    // Keep the card on the page: clamp off the right edge, and if there is
    // no room below the caret flip it upward instead of clipping.
    const width = 288;
    const below = window.innerHeight - coords.bottom > 240;
    const x = Math.max(8, Math.min(coords.left, window.innerWidth - width - 8));
    const y = below ? coords.bottom + 8 : coords.top - 8;
    const prev = suggestRef.current;
    const next: SuggestUI = {
      ...open, x, y,
      items,
      index: prev && prev.query === open.query ? Math.min(prev.index, items.length - 1) : 0,
    };
    suggestRef.current = next;
    setSuggest(next);
  };

  const moveSuggest = (delta: number) => {
    const s = suggestRef.current;
    if (!s || !s.items.length) return;
    const next = { ...s, index: (s.index + delta + s.items.length) % s.items.length };
    suggestRef.current = next;
    setSuggest(next);
  };

  const pickSuggest = (view: EditorView, item?: SuggestItem) => {
    const s = suggestRef.current;
    const pick = item ?? s?.items[s.index];
    if (!s || !pick) return;
    const { from, to } = s;
    closeSuggest();
    view.dispatch(view.state.tr.insertText(`[[${pick.title}]] `, from, to).scrollIntoView());
    view.focus();
    if (pick.id === 'new') {
      // File the page without leaving this sentence — the web can visit it later.
      const here = useStore.getState().activeNoteId;
      const { addNote, setActiveNote } = useStore.getState();
      addNote({ title: pick.title });
      if (here) setActiveNote(here);
    }
  };

  // Kept in a ref so the one-shot editorProps.handleKeyDown sees the live popover.
  const suggestKeys = useRef({
    move: moveSuggest,
    pick: (view: EditorView) => pickSuggest(view),
    close: closeSuggest,
    isOpen: () => suggestRef.current !== null,
  });
  useEffect(() => {
    suggestKeys.current = { move: moveSuggest, pick: (view: EditorView) => pickSuggest(view), close: closeSuggest, isOpen: () => suggestRef.current !== null };
  });


  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Typography,
      Highlight.configure({ multicolor: false }),
      Underline,
      Placeholder.configure({ placeholder }),
      CharacterCount,
      WikiLinks,
      InkDrying,
    ],
    content: parsedContent,
    editable,
    editorProps: {
      attributes: {
        class: `max-w-none focus:outline-none min-h-[200px] ${className}`,
        spellcheck: 'false',
      },
      handleKeyDown: (view, event) => {
        const keys = suggestKeys.current;
        if (!keys.isOpen()) return false;
        if (event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey)) { keys.move(1); return true; }
        if (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey)) { keys.move(-1); return true; }
        if (event.key === 'Enter') { keys.pick(view); return true; }
        if (event.key === 'Escape') { keys.close(); return true; }
        return false;
      },
    },
    onSelectionUpdate: ({ editor }) => {
      if (latest.current.typewriter) markCurrentBlock(editor);
      refreshSuggest(editor);
    },
    onCreate: ({ editor }) => {
      if (latest.current.typewriter) markCurrentBlock(editor);
    },
    onUpdate: ({ editor }) => {
      const { typewriter, headingAnchors, editable, onUpdate } = latest.current;
      if (typewriter) markCurrentBlock(editor);
      if (headingAnchors) assignHeadingIds(editor.view.dom);
      refreshSuggest(editor);
      if (!editable) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        onUpdate(JSON.stringify(editor.getJSON()), editor.storage.characterCount.words());
      }, 400);
    },
    onBlur: () => {
      // A click into the suggester must not count as leaving — the card
      // swallows its own mousedown so focus never actually leaves.
      closeSuggest();
    },
  });

  // Any scroll repositions the caret anyway — close rather than drift.
  useEffect(() => {
    if (!suggest) return;
    const close = () => closeSuggest();
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [suggest]);

  useEffect(() => {
    onEditorReady?.(editor);
    if (editor && headingAnchors) assignHeadingIds(editor.view.dom);
    return () => onEditorReady?.(null);
  }, [editor, onEditorReady, headingAnchors]);

  // On unmount, flush any pending save so the last keystrokes aren't lost.
  useEffect(() => () => {
    if (debounceRef.current && editor) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
      const { editable, onUpdate } = latest.current;
      if (editable) onUpdate(JSON.stringify(editor.getJSON()), editor.storage.characterCount.words());
    }
  }, [editor]);

  if (!editor) return null;

  return (
    <div className={clsx('relative', typewriter && 'typewriter')}>
      {editable && (
        <BubbleMenu
          editor={editor}
          options={{ placement: 'top' }}
          className="flex items-center gap-0.5 px-1.5 py-1.5 bg-ink rounded-md shadow-pop"
        >
          <Btn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} icon={Bold} title="Bold" />
          <Btn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} icon={Italic} title="Italic" />
          <Btn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} icon={Strikethrough} title="Strike" />
          <Btn active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()} icon={Highlighter} title="Mark it — the pencil's color" />
          <Btn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} icon={UnderlineIcon} title="Underline" />
          <Btn active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} icon={Code} title="Code" />
          <span className="w-px h-4 bg-paper/15 mx-1" />
          <Btn active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} icon={Heading1} title="Heading" />
          <Btn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} icon={Heading2} title="Subheading" />
          <span className="w-px h-4 bg-paper/15 mx-1" />
          <Btn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} icon={List} title="List" />
          <Btn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} icon={ListOrdered} title="Numbered list" />
          <Btn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} icon={Quote} title="Quote" />
        </BubbleMenu>
      )}

      <EditorContent editor={editor} />

      {/* The shelf of pages — appears under the caret while a [[ link is open */}
      {suggest && (
        <div
          className="ink-in fixed z-[85] w-72 bg-paper border border-line rounded shadow-pop overflow-hidden"
          style={{ left: suggest.x, top: suggest.y, transform: window.innerHeight - suggest.y < 120 ? 'translateY(-100%)' : undefined }}
          onMouseDown={event => event.preventDefault()}
          role="listbox"
          aria-label="Link to a page"
        >
          <p className="px-3.5 pt-2.5 pb-1 text-2xs font-mono text-ink-ghost">link to a page</p>
          <div className="pb-1.5 max-h-56 overflow-y-auto custom-scrollbar">
            {suggest.items.length === 0 && (
              <p className="px-3.5 py-2 text-[13px] font-serif text-ink-faint">No page by that name — keep typing to start one.</p>
            )}
            {suggest.items.map((item, i) => (
              <button
                key={item.id === 'new' ? '__new' : item.id}
                role="option"
                aria-selected={i === suggest.index}
                onMouseEnter={() => { const next = { ...suggest, index: i }; suggestRef.current = next; setSuggest(next); }}
                onMouseDown={e => { e.preventDefault(); if (editor) pickSuggest(editor.view, item); }}
                className={clsx(
                  'relative w-full flex items-center gap-2.5 pl-4 pr-3.5 py-[7px] text-left transition-colors',
                  i === suggest.index ? 'bg-paper-dim' : ''
                )}
              >
                {i === suggest.index && <span className="margin-mark" style={{ left: 2 }} />}
                {item.id === 'new' ? (
                  <PenNib className="w-3.5 h-3.5 -rotate-45 text-pencil flex-shrink-0" strokeWidth={2} />
                ) : (
                  <InkBlot seed={item.id} size={10} satellites={0} color={penOf(item.ink).color} opacity={0.75} className="flex-shrink-0 -mx-px" />
                )}
                <span className={clsx('flex-1 truncate font-serif text-[13px]', item.id === 'new' ? 'text-pencil italic' : 'text-ink')}>
                  {item.id === 'new' ? `Start “${item.title}”` : item.title}
                </span>
              </button>
            ))}
          </div>
          <p className="px-3.5 py-1.5 border-t border-line font-mono text-2xs text-ink-ghost">↵ links · esc keeps writing</p>
        </div>
      )}
    </div>
  );
};

const Btn: React.FC<{
  active?: boolean;
  onClick: () => void;
  icon: React.ElementType;
  title: string;
}> = ({ active, onClick, icon: Icon, title }) => (
  <button
    onClick={onClick}
    title={title}
    aria-label={title}
    className={clsx(
      'w-7 h-7 rounded-sm flex items-center justify-center transition-colors',
      active ? 'bg-paper/15 text-paper' : 'text-paper/55 hover:text-paper hover:bg-paper/10'
    )}
  >
    <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
  </button>
);
