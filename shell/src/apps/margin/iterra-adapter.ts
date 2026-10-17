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
   enough: BroadcastChannel carries remote merges to every sibling.

   Rows are owned: `user_id` stamps the auth uid and RLS restricts the
   table to the signed-in user — anonymous sign-in must be enabled on the
   project, otherwise the attach stays off and the store stays local. */
let syncUid: string | null = null; // uid the live adapter is bound to
let syncRetry: ReturnType<typeof setTimeout> | null = null;
let syncWatcher = false;
async function attachItterraSync() {
  const it = window.iterra;
  if (!it?.sync?.attach || !supabase) return;
  const sb = supabase;
  const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  const uid = data.session?.user?.id;
  if (!uid || syncUid === uid) return; // unsigned → RLS rejects every call; same uid → already bound
  const res = await it.sync.attach({
    /* the pull checkpoint is keyed by adapter name — name it per-owner so a
       sign-in swap doesn't inherit the previous user's watermark and skip
       their rows */
    name: `supabase:${uid}`,
    pull: async (since: number) => {
      /* Delta pulls filter on `synced_at` — the DATABASE's own stamp, set by
         trigger at commit. The entity's `updatedAt` can't be used here: it's
         the writer's client clock at edit time, so a write that arrives late
         (retry-queue drain, offline put, skewed device clock) would carry a
         stamp older than the pull checkpoint and stay invisible to every
         peer forever. `since` is the last watermark — server-clock domain —
         backed off by the hub's overlap window, so late-committing rows
         still fall inside the next pull.
         Page through the full result: PostgREST caps a single response at
         ~1000 rows, and a short, unordered read would leave the rows past
         the cap permanently behind the advancing checkpoint. Ordering by
         synced_at+key makes each page deterministic and the LAST row's
         synced_at the observed high-water mark. */
      const out: any[] = [];
      let watermark = since;
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data: rows, error } = await sb
          .from('iterra_entities')
          .select('key, body, deleted, "deletedAt", synced_at')
          .eq('user_id', uid)
          .gte('synced_at', new Date(since).toISOString())
          .order('synced_at', { ascending: true })
          .order('key', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        for (const r of rows ?? []) {
          const st = Date.parse(r.synced_at) || 0;
          if (st > watermark) watermark = st;
          if (r.deleted) {
            /* tombstone: the hub merges it as a local remove unless a newer
               local edit wins — deletedAt is the delete's wall-clock stamp,
               body.updatedAt the deleted entity's last edit stamp. */
            const b = r.body && typeof r.body === 'object' ? r.body : {};
            out.push({
              key: r.key || b.key,
              __deleted: true,
              deletedAt: typeof r.deletedAt === 'number' ? r.deletedAt : st,
              updatedAt: b.updatedAt,
            });
          } else {
            out.push(r.body);
          }
        }
        if (!rows || rows.length < PAGE) break;
      }
      return { rows: out, watermark };
    },
    put: async (e: any) => {
      /* supabase-js resolves PostgREST failures as {error} — it does NOT
         reject. Without the check a denied/failed write would look exactly
         like success: no sync.status().error, no retry queue, and the remote
         stays silently diverged.
         `updatedAt` keeps the entity's edit stamp (peer-merge LWW compares
         it); `synced_at` is stamped by the database trigger at commit — the
         pull filter's clock domain. `deleted:false` resurrects a tombstoned
         row when a queued/local put lands after a remote delete. */
      const { error } = await sb.from('iterra_entities').upsert(
        {
          key: e.key ?? `${e.app}:${e.type}:${e.id}`,
          app: e.app,
          type: e.type,
          courseId: e.courseId ?? null,
          user_id: uid,
          updatedAt: e.updatedAt ?? Date.now(),
          deleted: false,
          deletedAt: null,
          body: e,
        },
        { onConflict: 'user_id,key' },
      );
      if (error) throw error;
    },
    remove: async (key: string) => {
      /* Soft-delete: a real DELETE would leave no trace for peers to pull —
         their local copies would live forever (and a stale queued put could
         resurrect the row silently). The tombstone row keeps `body` so
         deletedAt/updatedAt still resolve LWW against a newer local edit. */
      const { error } = await sb
        .from('iterra_entities')
        .update({ deleted: true, deletedAt: Date.now() })
        .eq('key', key)
        .eq('user_id', uid);
      if (error) throw error;
    },
    onConflict: (l: any, r: any) => ((r?.updatedAt || 0) >= (l?.updatedAt || 0) ? r : l),
  });
  /* Only mark bound on a successful first pull. A failed attach must retry —
     marking it up-front would leave sync silently dead until reload. */
  if (res && res.ok !== false) {
    syncUid = uid;
    return;
  }
  if (!syncRetry) {
    syncRetry = setTimeout(() => {
      syncRetry = null;
      void attachItterraSync();
    }, 30000);
  }
}

function watchItterraSync() {
  if (syncWatcher || !supabase) return;
  syncWatcher = true;
  void attachItterraSync();
  /* anonymous sign-in lands after boot — attach when the session appears
     instead of requiring a reload after first run. A DIFFERENT uid also
     re-attaches (the per-uid adapter name restarts the checkpoint). On
     sign-out the adapter stays bound to the stale uid: its calls fail RLS
     and surface in sync.status().error until reload — contained, if inelegant. */
  supabase.auth.onAuthStateChange((_e: any, session: any) => {
    if (session?.user?.id) void attachItterraSync();
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
  /* a note's course: structured binding first, then tag inference */
  const courseForNote = async (n: Note): Promise<{ course?: string; courseId?: string }> => {
    if (n.courseId) return { course: n.course, courseId: n.courseId };
    for (const tag of n.tags ?? []) {
      const key = await canonicalCourseKey(tag);
      if (key) return { course: tag, courseId: key };
    }
    return {};
  };

  /* published snapshots — an entity is only put when its wire shape moved */
  const published = new Map<string, string>();
  /* keys whose last put failed/quarantined, keyed to their rejected wire
     shape — retried when the shape changes, never in a hot loop */
  const failedPublishes = new Map<string, string>();
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
      /* Only mark a key published once the store actually takes it —
         marking first meant a failed/quarantined write was silently never
         retried. `failedPublishes` pins the rejected wire shape so a
         permanently-bad entity doesn't retry every tick, while a CHANGED
         shape still gets its second chance. */
      for (const [key, { ent }] of wanted) {
        if (!ent) continue;
        const j = JSON.stringify(ent);
        if (published.get(key) !== j && failedPublishes.get(key) !== j) {
          const r = await it.store.put(ent).catch(() => null);
          if (r && r.ok !== false) {
            published.set(key, j);
            failedPublishes.delete(key);
          } else {
            failedPublishes.set(key, j);
          }
        }
      }
      /* a failed wire shape whose entity is gone must be forgotten — a
         later re-create with identical content should get a fresh attempt */
      for (const key of [...failedPublishes.keys()]) {
        if (!wanted.has(key)) failedPublishes.delete(key);
      }
      for (const key of [...published.keys()]) {
        if (!wanted.has(key)) {
          /* same contract on the way out: drop the marker only once the
             local remove lands — the remote remove is queued/retried by the
             hub's outbound queue either way */
          const ok = await it.store.remove(key).then(() => true).catch(() => false);
          if (ok) published.delete(key);
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
        /* the sent entity's course binding follows the note into the
           dossier — a bare course entity IS the course (key is canonical) */
        const entCourseId = rec?.entity?.type === 'course'
          ? rec.entity.courseId ?? rec.entity.key ?? rec.entity.id
          : rec?.entity?.courseId;
        if (typeof entCourseId === 'string') {
          note.courseId = entCourseId;
          note.course = rec.entity.course ?? (rec.entity.type === 'course' ? rec.entity.title : undefined);
        }
        await saveNote(note);
        /* provenance edge: the note was derived FROM the sent entity —
           dossiers and search read links, not the title prefix */
        const srcKey = typeof rec?.entity?.key === 'string' ? rec.entity.key : null;
        if (srcKey) {
          try { await (window as any).iterra?.links?.add(`margin:note:${note.id}`, srcKey, 'derivedFrom'); } catch { /* best effort */ }
        }
        try {
          window.dispatchEvent(new CustomEvent('margin:intake-note', { detail: note }));
        } catch { /* the note is persisted; the view refresh is best-effort */ }
        return { url: `/apps/margin/?note=${note.id}` };
      },
    },
    wake: () => { drain(); },
  });

  watchItterraSync();
}

/* iterra.ts side-imports this module, and this module imports back from
   iterra.ts — a cycle. Module-eval order puts US first, so registerAdapter
   must not run at eval time: onMarginSnapshot touches iterra.ts module
   state (its listener Set) before that body has evaluated — a TDZ crash
   that took the whole app down. A microtask runs after the graph settles. */
if (typeof window !== 'undefined') queueMicrotask(registerAdapter);
