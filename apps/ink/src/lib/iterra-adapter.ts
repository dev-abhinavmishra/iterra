/* iterra adapter — ink's one door to the canonical store.
   Contract: docs/ADAPTER.md.

   What this does:
   • publishes 'note' entities — diff-aware, incremental
   • answers 'note.create' intakes — a new page seeded from the sending
     entity, deep-linkable via the existing ?note= param
   • emits 'note.created' when a genuinely new page appears (textless —
     the feed row stays with the legacy feed() call in iterra.ts) */

import { useStore } from '../store';
import { extractText } from './notes';
import type { Note } from '../store';

declare const window: any;

/* ── pure helpers (contract-tested) ─────────────────────────────────────── */

/** First readable line of a page's TipTap JSON — the entity's `sub`. */
export function firstLine(content: string | undefined): string | undefined {
  if (!content) return undefined;
  const text = extractText(content, 96);
  if (!text) return undefined;
  return text.length > 80 ? text.slice(0, 79) + '…' : text;
}

export function noteEntity(n: Note, opts: { course?: string; courseId?: string } = {}): Record<string, unknown> {
  return {
    app: 'ink',
    type: 'note',
    id: n.id,
    title: n.title || 'untitled',
    sub: firstLine(n.content) ?? n.folder,
    ...(opts.course ? { course: opts.course } : {}),
    ...(opts.courseId ? { courseId: opts.courseId } : {}),
    url: `/apps/ink/?note=${n.id}`,
    data: { updated: n.lastModified, folder: n.folder, tags: n.tags, words: n.wordCount },
  };
}

/** TipTap doc seeded from a note.create intake — the entity's title as a
    heading, the selection text as the opening paragraph. */
export function intakeDoc(rec: { from?: string; entity?: any; payload?: any }): string {
  const title = rec?.entity?.title || `From ${rec?.from ?? 'the terrain'}`;
  const text = typeof rec?.payload?.text === 'string' ? rec.payload.text.trim() : '';
  return JSON.stringify({
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: title }] },
      ...(text ? [{ type: 'paragraph', content: [{ type: 'text', text }] }] : []),
      { type: 'paragraph' },
    ],
  });
}

/* ── registered adapter ─────────────────────────────────────────────────── */

let registered = false;

export function registerAdapter() {
  if (registered) return;
  const it = window.iterra;
  if (!it?.adapter || !it?.store) return;
  registered = true;

  const courseKeyCache = new Map<string, Promise<string | null>>();
  const canonicalCourseKey = (label?: string): Promise<string | null> => {
    const c = (label ?? '').trim();
    if (!c || !it.courses?.byCode) return Promise.resolve(null);
    if (!courseKeyCache.has(c)) {
      courseKeyCache.set(
        c,
        Promise.resolve(it.courses.byCode(c))
          .then((e: any) => e?.key ?? null)
          .catch(() => null),
      );
    }
    return courseKeyCache.get(c)!;
  };
  const courseForNote = async (n: Note): Promise<{ course?: string; courseId?: string }> => {
    for (const tag of n.tags ?? []) {
      const key = await canonicalCourseKey(tag);
      if (key) return { course: tag, courseId: key };
    }
    return {};
  };

  /* dirty sets + serialized drain — one put per changed entity, in order */
  const dirty = new Set<string>();
  const removed = new Set<string>();
  let knownIds: Set<string> | null = null;
  const published = new Map<string, string>();
  let chain: Promise<void> = Promise.resolve();
  let queued = false;

  const liveNotes = () => useStore.getState().notes.filter((n) => !n.trashedAt);

  const diff = () => {
    const ids = new Set(liveNotes().map((n) => n.id));
    if (knownIds) {
      for (const id of ids) if (!knownIds.has(id)) dirty.add(id);
      for (const id of knownIds) if (!ids.has(id)) removed.add(`ink:note:${id}`);
      /* trashed notes leave the store; content edits republish via the
         snapshot diff — lastModified moves with writing */
      for (const n of liveNotes()) {
        if (published.get(`ink:note:${n.id}`)?.includes(`"updated":${n.lastModified}`) === false) dirty.add(n.id);
      }
    } else {
      for (const id of ids) dirty.add(id);
    }
    knownIds = ids;
  };

  const drain = () => {
    if (queued) return;
    queued = true;
    chain = chain.then(async () => {
      const s = useStore.getState();
      const byId = new Map(s.notes.map((n) => [n.id, n]));
      for (const key of [...removed]) {
        removed.delete(key);
        if (published.delete(key)) await it.store.remove(key).catch(() => {});
      }
      for (const id of [...dirty]) {
        dirty.delete(id);
        const n = byId.get(id);
        if (!n || n.trashedAt) continue;
        const { course, courseId } = await courseForNote(n);
        const ent = noteEntity(n, { course, courseId });
        const j = JSON.stringify(ent);
        if (published.get(`ink:note:${id}`) !== j) {
          published.set(`ink:note:${id}`, j);
          await it.store.put(ent).catch(() => {});
        }
      }
    }).catch(() => {}).finally(() => {
      queued = false;
      if (dirty.size || removed.size) drain();
    });
  };

  let seenNoteIds: Set<string> | null = null;
  const emitNew = () => {
    const ids = new Set(liveNotes().map((n) => n.id));
    if (seenNoteIds && it.events?.emit) {
      for (const n of liveNotes()) {
        if (!seenNoteIds.has(n.id)) {
          it.events.emit('note.created', {
            noteId: n.id,
            title: n.title || 'untitled',
            url: `/apps/ink/?note=${n.id}`,
          }).catch(() => {});
        }
      }
    }
    seenNoteIds = ids;
  };

  const start = () => { diff(); drain(); emitNew(); };
  if (useStore.persist?.hasHydrated?.()) start();
  else useStore.persist?.onFinishHydration?.(start);
  useStore.subscribe(() => { diff(); drain(); emitNew(); });

  it.adapter({
    name: 'ink',
    title: 'Ink',
    /* same shape the bridge registered — {open, notes, todayWords} */
    summary: () => {
      const { notes, activeNoteId } = useStore.getState();
      const live = notes.filter((n) => !n.trashedAt);
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const todayWords = live
        .filter((n) => n.lastModified >= dayStart.getTime())
        .reduce((sum, n) => sum + (n.wordCount || 0), 0);
      return {
        open: live.find((n) => n.id === activeNoteId)?.title || null,
        notes: live.length,
        todayWords: todayWords || undefined,
      };
    },
    intakes: {
      /* {entity,payload:{text?}} → a new page on the desk, opened via the
         existing ?note= deep link. */
      'note.create': (rec: any) => {
        const title = rec?.entity?.title || `From ${rec?.from ?? 'the terrain'}`;
        const text = typeof rec?.payload?.text === 'string' ? rec.payload.text.trim() : '';
        const id = useStore.getState().addNote({
          title,
          content: intakeDoc(rec),
          wordCount: text ? text.split(/\s+/).length : 0,
        });
        return { url: `/apps/ink/?note=${id}` };
      },
    },
    wake: () => { diff(); drain(); },
  });
}

if (typeof window !== 'undefined') registerAdapter();
