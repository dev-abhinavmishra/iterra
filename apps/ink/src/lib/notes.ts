import type { Note } from '../store';

export interface TipTapNode {
  type?: string;
  text?: string;
  attrs?: { level?: number; language?: string };
  marks?: { type: string }[];
  content?: TipTapNode[];
}

const parseDoc = (content: string): TipTapNode | null => {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
};

/* ── Doc sanitizing ───────────────────────────────────────────
 * Imported or legacy content can contain node types the schema
 * doesn't know; ProseMirror throws on those at editor init.
 * Walk the tree and keep only what this editor can render. */

const MARK_TYPES = new Set(['bold', 'italic', 'strike', 'code', 'highlight', 'underline']);

const plainText = (node: TipTapNode): string =>
  node.type === 'text' && typeof node.text === 'string'
    ? node.text
    : (node.content ?? []).map(plainText).join('');

const sanitizeInlineNode = (node: TipTapNode): TipTapNode | null => {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'text') {
    if (typeof node.text !== 'string') return null;
    const out: TipTapNode = { type: 'text', text: node.text };
    const marks = Array.isArray(node.marks) ? node.marks.filter(m => m && MARK_TYPES.has(m.type)) : [];
    if (marks.length) out.marks = marks.map(m => ({ type: m.type }));
    return out;
  }
  if (node.type === 'hardBreak') return { type: 'hardBreak' };
  // Unknown inline node — keep its words, drop its shape
  const text = plainText(node);
  return text ? { type: 'text', text } : null;
};

const sanitizeBlockNode = (node: TipTapNode): TipTapNode | null => {
  if (!node || typeof node !== 'object' || typeof node.type !== 'string') return null;
  switch (node.type) {
    case 'paragraph':
    case 'heading': {
      const content = (node.content ?? [])
        .map(sanitizeInlineNode)
        .filter((child): child is TipTapNode => child !== null);
      const out: TipTapNode = { type: node.type };
      if (node.type === 'heading') {
        const level = node.attrs?.level;
        out.attrs = { level: level === 1 || level === 2 || level === 3 ? level : 2 };
      }
      if (content.length) out.content = content;
      return out;
    }
    case 'blockquote': {
      const content = sanitizeBlocks(node.content);
      return { type: 'blockquote', content: content.length ? content : [{ type: 'paragraph' }] };
    }
    case 'listItem': {
      const content = sanitizeBlocks(node.content);
      // Schema needs the first child to be a paragraph
      if (!content.length || content[0].type !== 'paragraph') content.unshift({ type: 'paragraph' });
      return { type: 'listItem', content };
    }
    case 'bulletList':
    case 'orderedList': {
      const items = (Array.isArray(node.content) ? node.content : [])
        .map(sanitizeBlockNode)
        .filter((child): child is TipTapNode => child?.type === 'listItem');
      if (items.length) return { type: node.type, content: items };
      const text = plainText(node).trim();
      return text ? { type: 'paragraph', content: [{ type: 'text', text }] } : null;
    }
    case 'codeBlock': {
      const text = plainText(node);
      const out: TipTapNode = { type: 'codeBlock' };
      if (typeof node.attrs?.language === 'string' && node.attrs.language) out.attrs = { language: node.attrs.language };
      if (text) out.content = [{ type: 'text', text }];
      return out;
    }
    case 'horizontalRule':
      return { type: 'horizontalRule' };
    default: {
      // Unknown block — flatten to a paragraph so nothing is lost
      const text = plainText(node).trim();
      return text ? { type: 'paragraph', content: [{ type: 'text', text }] } : null;
    }
  }
};

const sanitizeBlocks = (children: TipTapNode[] | undefined): TipTapNode[] => {
  const out: TipTapNode[] = [];
  for (const child of Array.isArray(children) ? children : []) {
    if (child?.type === 'text' || child?.type === 'hardBreak') {
      const inline = sanitizeInlineNode(child);
      if (inline) out.push({ type: 'paragraph', content: [inline] });
      continue;
    }
    const block = sanitizeBlockNode(child);
    if (block) out.push(block);
  }
  return out;
};

/**
 * Parse a stored note into a doc this editor can always open.
 * Non-JSON content (old plain-text or HTML notes) becomes a paragraph.
 */
export const sanitizeDoc = (content: string): TipTapNode => {
  const parsed = parseDoc(content);
  if (parsed && typeof parsed === 'object') {
    const topLevel = Array.isArray(parsed) ? parsed : parsed.content;
    const blocks = sanitizeBlocks(topLevel);
    return { type: 'doc', content: blocks.length ? blocks : [{ type: 'paragraph' }] };
  }
  const text = (typeof parsed === 'string' ? parsed : content.replace(/<[^>]*>?/gm, '')).trim();
  return {
    type: 'doc',
    content: text ? [{ type: 'paragraph', content: [{ type: 'text', text }] }] : [{ type: 'paragraph' }],
  };
};

/** Flatten a TipTap doc into plain text — used for snippets and search. */
export const extractText = (content: string, max = 240): string => {
  const doc = parseDoc(content);
  if (!doc) return content.replace(/<[^>]*>?/gm, '').slice(0, max);
  const parts: string[] = [];
  const walk = (node: TipTapNode) => {
    if (node.type === 'text' && node.text) parts.push(node.text);
    node.content?.forEach(walk);
  };
  walk(doc);
  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, max);
};

/** Pull every [[Note Title]] reference out of already-flattened text.
 *  Case-insensitively deduped; the first-seen casing wins so ghosts and
 *  lookups agree on what the writer actually typed. */
export const wikiLinksFromText = (text: string): string[] => {
  const found = new Map<string, string>();
  for (const match of text.matchAll(/\[\[([^\][\n]+)\]\]/g)) {
    const title = match[1].trim();
    if (title && !found.has(title.toLowerCase())) found.set(title.toLowerCase(), title);
  }
  return Array.from(found.values());
};

export const extractWikiLinks = (content: string): string[] =>
  wikiLinksFromText(extractText(content, 100000));

/* ── The note index ───────────────────────────────────────────
 * Search, backlinks and the ink web all need every note's flat text
 * and links — parsing the same JSON three different ways on every
 * render is the kind of thing that feels fine at 10 notes and stalls
 * at 300. Components compute this once per notes-array change and
 * share it around. */
export interface NoteIndex {
  text: string;
  lower: string;
  links: string[];
}

export const buildNoteIndex = (notes: Note[]): Map<string, NoteIndex> => {
  const index = new Map<string, NoteIndex>();
  for (const note of notes) {
    const text = extractText(note.content, 100000);
    index.set(note.id, { text, lower: text.toLowerCase(), links: wikiLinksFromText(text) });
  }
  return index;
};

/* The index keyed by the notes array itself — every mounted view that asks
 * for one shares the same parse, so a big library is walked once per change
 * total, not once per mounted component. */
const indexCache = new WeakMap<Note[], Map<string, NoteIndex>>();
export const getNoteIndex = (notes: Note[]): Map<string, NoteIndex> => {
  let index = indexCache.get(notes);
  if (!index) {
    index = buildNoteIndex(notes);
    indexCache.set(notes, index);
  }
  return index;
};

/** Notes that point at `title` through a [[wikilink]]. */
export const findBacklinks = (notes: Note[], title: string): Note[] => {
  const target = title.trim().toLowerCase();
  if (!target) return [];
  return notes.filter(
    note => !note.trashedAt && extractWikiLinks(note.content).some(link => link.toLowerCase() === target)
  );
};

/** Same lookup, but against a prebuilt index — the caller has already parsed every doc. */
export const findBacklinksIndexed = (notes: Note[], index: Map<string, NoteIndex>, title: string): Note[] => {
  const target = title.trim().toLowerCase() || 'untitled';
  return notes.filter(
    note => !note.trashedAt && (index.get(note.id)?.links ?? []).some(link => link.toLowerCase() === target)
  );
};

/** Serialise a note to Markdown for export. */
export const noteToMarkdown = (note: Note): string => {
  const doc = parseDoc(note.content);

  const inline = (node: TipTapNode): string => {
    if (node.type === 'hardBreak') return '  \n';
    if (node.type !== 'text' || !node.text) {
      return node.content?.map(inline).join('') ?? '';
    }
    let text = node.text;
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') text = `**${text}**`;
      else if (mark.type === 'italic') text = `*${text}*`;
      else if (mark.type === 'strike') text = `~~${text}~~`;
      else if (mark.type === 'code') text = `\`${text}\``;
      else if (mark.type === 'highlight') text = `==${text}==`;
      else if (mark.type === 'underline') text = `<u>${text}</u>`;
    }
    return text;
  };

  const block = (node: TipTapNode, depth = 0): string => {
    const indent = '  '.repeat(depth);
    switch (node.type) {
      case 'heading':
        return `${'#'.repeat(node.attrs?.level ?? 1)} ${node.content?.map(inline).join('') ?? ''}`;
      case 'paragraph':
        return node.content?.map(inline).join('') ?? '';
      case 'blockquote':
        return (node.content ?? []).map(child => `> ${block(child, depth)}`).join('\n');
      case 'codeBlock':
        return `\`\`\`\n${node.content?.map(c => c.text ?? '').join('') ?? ''}\n\`\`\``;
      case 'bulletList':
        return (node.content ?? []).map(item => `${indent}* ${item.content?.map(c => block(c, depth)).join(`\n${indent}  `)}`).join('\n');
      case 'orderedList':
        return (node.content ?? []).map((item, i) => `${indent}${i + 1}. ${item.content?.map(c => block(c, depth)).join(`\n${indent}   `)}`).join('\n');
      case 'horizontalRule':
        return '---';
      default:
        return node.content?.map(c => block(c, depth)).join('\n\n') ?? '';
    }
  };

  const body = doc?.content?.map(child => block(child)).join('\n\n') ?? extractText(note.content);
  const tags = note.tags.length ? `\n\ntags: ${note.tags.map(t => `#${t}`).join(' ')}` : '';
  return `# ${note.title || 'Untitled'}\n\n${body}${tags}\n`;
};

export const downloadFile = (name: string, text: string, type = 'text/markdown') => {
  const blob = new Blob([text], { type });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  link.click();
  // Defer the revoke — doing it in the same tick can cancel the download in Firefox.
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
};

export const slugify = (title: string): string =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'note';

export const todayKey = (date = new Date()): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const dayKey = (time: number): string => todayKey(new Date(time));

/** Map of yyyy-mm-dd → number of notes touched that day (created or edited). */
export const activityByDay = (notes: Note[]): Map<string, number> => {
  const map = new Map<string, number>();
  for (const note of notes) {
    for (const key of new Set([dayKey(note.createdAt), dayKey(note.lastModified)])) {
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  }
  return map;
};

/** Bind every live note into a single Markdown volume, separated by asterisms. */
export const libraryToMarkdown = (notes: Note[]): string =>
  notes.map(noteToMarkdown).join('\n\u2042\n\n');

/** Consecutive days with activity, ending today or yesterday. */
export const currentStreak = (days: Map<string, number>): number => {
  let streak = 0;
  const cursor = new Date();
  if (!days.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor.getTime()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
};


