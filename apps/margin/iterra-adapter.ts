/* iterra adapter — margin's one door to the canonical store.
   Contract: docs/ADAPTER.md.

   What this does:
   • publishes 'note' entities (sub = first line of content) plus 'deck' and
     'quiz' entities from the IndexedDB study layer — diff-aware, riding the
     ambient publish tick in iterra.ts so writes stay incremental
   • answers 'note.create' intakes — a new note seeded from the sending
     entity, deep-linkable and opened in the editor
   • emits 'note.created' when a genuinely new note appears (textless —
     the feed row stays with the legacy feed() call in iterra.ts) */

import type { Deck, Note, Quiz } from './types';
import { getAllDecks, getAllQuizzes, saveNote } from './services/storageService';
import { marginNotes, onMarginSnapshot } from './iterra';
import { supabase } from './services/supabaseClient';

/* ── whole-store sync (docs/SYNC.md) — margin already owns a Supabase
   client for its usage counters; when the env vars exist we ALSO attach
   the canonical store's remote mirror. One frame owning the adapter is
   enough: BroadcastChannel carries remote merges to every sibling. */
let syncAttached = false;
function attachItterraSync() {
  const it = window.iterra;
  if (syncAttached || !it?.sync?.attach || !supabase) return;
  syncAttached = true;
  it.sync.attach({
    name: 'supabase',
    pull: async (since: number) => {
      const { data, error } = await supabase
        .from('iterra_entities')
        .select('body')
        .gt('updatedAt', since);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.body);
    },
    put: async (e: any) => {
      await supabase.from('iterra_entities').upsert({
        key: e.key ?? `${e.app}:${e.type}:${e.id}`,
        app: e.app,
        type: e.type,
        courseId: e.courseId ?? null,
        updatedAt: e.updatedAt ?? Date.now(),
        body: e,
      });
    },
    remove: async (key: string) => {
      await supabase.from('iterra_entities').delete().eq('key', key);
    },
    onConflict: (_l: any, r: any) => r,
  });
}

declare const window: any;

/* ── pure helpers (contract-tested) ─────────────────────────────────────── */

/** First readable line of a note's content — the store entity's `sub`. */
export function firstLine(content: string | undefined): string | undefined {
  const text = (content ?? '')
    .replace(/<[^>]+>/g, ' ')          // html
    .replace(/[#>*_`~\-[\]()!]/g, ' ') // markdown affordances
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return undefined;
  return text.length > 80 ? text.slice(0, 79) + '…' : text;
}

export function noteEntity(n: Note, opts: { course?: string; courseId?: string } = {}): Record<string, unknown> {
  return {
    app: 'margin',
    type: 'note',
    id: n.id,
    title: n.title || 'untitled',
    sub: firstLine(n.content),
    ...(opts.course ? { course: opts.course } : {}),
    ...(opts.courseId ? { courseId: opts.courseId } : {}),
    url: `/apps/margin/?note=${n.id}`,
    data: { updated: n.lastAccessed ?? n.date, noteType: n.type, tags: n.tags },
  };
}

export function deckEntity(d: Deck, opts: { course?: string; courseId?: string } = {}): Record<string, unknown> {
  return {
    app: 'margin',
    type: 'deck',
    id: d.id,
    title: d.title || 'untitled deck',
    sub: `${d.cards?.length ?? 0} cards`,
    ...(opts.course ? { course: opts.course } : {}),
    ...(opts.courseId ? { courseId: opts.courseId } : {}),
    url: `/apps/margin/?deck=${d.id}`,
    data: { cards: d.cards?.length ?? 0, updated: d.createdAt, sourceNoteId: d.sourceNoteId },
  };
}

export function quizEntity(q: Quiz, opts: { course?: string; courseId?: string } = {}): Record<string, unknown> {
  return {
    app: 'margin',
    type: 'quiz',
    id: q.id,
    title: q.title || 'untitled quiz',
    sub: `${q.questions?.length ?? 0} questions`,
    ...(opts.course ? { course: opts.course } : {}),
    ...(opts.courseId ? { courseId: opts.courseId } : {}),
    url: `/apps/margin/?quiz=${q.id}`,
    data: { questions: q.questions?.length ?? 0, attempts: q.attempts?.length ?? 0, updated: q.createdAt, sourceNoteId: q.sourceNoteId },
  };
}

/** A note seeded by a note.create intake — margin's own Note shape. */
export function intakeNote(rec: { id?: string; from?: string; entity?: any; payload?: any }): Note {
  const title = rec?.entity?.title || `From ${rec?.from ?? 'the terrain'}`;
  const text = typeof rec?.payload?.text === 'string' ? rec.payload.text.trim() : '';
  const stamp = new Date();
  return {
    id: `intake-${rec?.id ?? stamp.getTime()}`,
    title,
    date: stamp.toLocaleDateString(),
    content: `# ${title}${text ? `\n\n${text}` : ''}`,
    transcript: text,
    type: 'TEXT',
    tags: rec?.from ? [rec.from] : [],
    lastAccessed: stamp.toISOString(),
  };
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
  /* a note's course is inferred from its tags — the first tag that resolves */
  const courseForNote = async (n: Note): Promise<{ course?: string; courseId?: string }> => {
    for (const tag of n.tags ?? []) {
      const key = await canonicalCourseKey(tag);
      if (key) return { course: tag, courseId: key };
    }
    return {};
  };

  /* published snapshots — an entity is only put when its wire shape moved */
  const published = new Map<string, string>();
  let chain: Promise<void> = Promise.resolve();
  const drain = () => {
    chain = chain.then(async () => {
      const notes = marginNotes();
      const [decks, quizzes] = await Promise.all([
        getAllDecks().catch(() => [] as Deck[]),
        getAllQuizzes().catch(() => [] as Quiz[]),
      ]);
      const wanted = new Map<string, { ent: Record<string, unknown> | null; key: string }>();
      for (const n of notes) {
        const key = `margin:note:${n.id}`;
        wanted.set(key, { ent: null, key });
        const { course, courseId } = await courseForNote(n);
        const ent = noteEntity(n, { course, courseId });
        wanted.set(key, { ent, key });
      }
      for (const d of decks) {
        const key = `margin:deck:${d.id}`;
        wanted.set(key, { ent: deckEntity(d), key });
      }
      for (const q of quizzes) {
        const key = `margin:quiz:${q.id}`;
        wanted.set(key, { ent: quizEntity(q), key });
      }
      for (const [key, { ent }] of wanted) {
        if (!ent) continue;
        const j = JSON.stringify(ent);
        if (published.get(key) !== j) {
          published.set(key, j);
          await it.store.put(ent).catch(() => {});
        }
      }
      for (const key of [...published.keys()]) {
        if (!wanted.has(key)) {
          published.delete(key);
          await it.store.remove(key).catch(() => {});
        }
      }
      /* emits — a note id the diff has never seen is 'note.created' news */
      if (it.events?.emit && seenNoteIds) {
        for (const n of notes) {
          if (!seenNoteIds.has(n.id)) {
            it.events.emit('note.created', {
              noteId: n.id,
              title: n.title || 'untitled',
              url: `/apps/margin/?note=${n.id}`,
            }).catch(() => {});
          }
        }
      }
      seenNoteIds = new Set(notes.map((n) => n.id));
    }).catch(() => {});
  };
  let seenNoteIds: Set<string> | null = null;

  onMarginSnapshot(drain);
  drain();

  it.adapter({
    name: 'margin',
    title: 'Margin',
    /* same shape the bridge registered — {notes, last} for the rail */
    summary: () => {
      const notes = marginNotes();
      if (!notes.length) return { notes: 0 };
      const last = [...notes].sort(
        (a, b) => new Date(b.lastAccessed || 0).getTime() - new Date(a.lastAccessed || 0).getTime(),
      )[0];
      return { notes: notes.length, last: last?.title || undefined };
    },
    intakes: {
      /* {entity,payload:{text?}} → a new note seeded from the entity; the App
         opens it via the margin:intake-note CustomEvent. */
      'note.create': async (rec: any) => {
        const note = intakeNote(rec);
        await saveNote(note);
        try {
          window.dispatchEvent(new CustomEvent('margin:intake-note', { detail: note }));
        } catch { /* the note is persisted; the view refresh is best-effort */ }
        return { url: `/apps/margin/?note=${note.id}` };
      },
    },
    wake: () => { drain(); },
  });

  attachItterraSync();
}

/* iterra.ts side-imports this module, and this module imports back from
   iterra.ts — a cycle. Module-eval order puts US first, so registerAdapter
   must not run at eval time: onMarginSnapshot touches iterra.ts module
   state (its listener Set) before that body has evaluated — a TDZ crash
   that took the whole app down. A microtask runs after the graph settles. */
if (typeof window !== 'undefined') queueMicrotask(registerAdapter);
