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
import { flushNativeStore } from '../../../integration/nativePersistence';

/* intake drains can race the desk's persist hydration — a mutation made
   pre-hydration is stomped when persisted state lands. Await it; throw on
   timeout so the hub releases the claim and a later drain delivers. */
function whenHydrated(timeoutMs = 9000): Promise<void> {
  const p = (useStore as { persist?: {
    hasHydrated?: () => boolean;
    onFinishHydration?: (cb: () => void) => void;
  } }).persist;
  if (!p?.hasHydrated || p.hasHydrated()) return Promise.resolve();
  return new Promise((res, rej) => {
    const done = () => { clearTimeout(t); clearInterval(poll); res(); };
    const t = setTimeout(() => { clearInterval(poll); rej(new Error('ink store not hydrated')); }, timeoutMs);
    const poll = setInterval(() => { if (p.hasHydrated?.()) done(); }, 150);
    p.onFinishHydration?.(done);
  });
}

/* The slice of the terrain surface this adapter touches — typed so the
   wiring stays honest without leaning on `any`. */
interface IterraAdapterSpec {
  name: string;
  title: string;
  summary: () => { open: string | null; notes: number; todayWords?: number };
  intakes: Record<string, (rec: IntakeRecord) => Promise<{ url: string }>>;
  wake?: () => void;
}
interface IterraSurface {
  adapter?: (spec: IterraAdapterSpec) => void;
  store?: {
    put: (entity: Record<string, unknown>) => Promise<unknown>;
    remove: (key: string) => Promise<unknown>;
  };
  courses?: { byCode: (code: string) => Promise<{ key?: string } | null> };
  events?: { emit: (type: string, payload: Record<string, unknown>) => Promise<unknown> };
}
interface IntakeRecord {
  id?: string;
  from?: string;
  entity?: { app?: string; type?: string; id?: string; title?: string; key?: string; courseId?: string; course?: string };
  payload?: { text?: string };
}

declare const window: { iterra?: IterraSurface };

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
export function intakeDoc(rec: IntakeRecord): string {
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
  /* Narrowed once — closures below don't re-narrow the optionals. */
  const { adapter, store, courses, events } = it;

  const courseKeyCache = new Map<string, Promise<string | null>>();
  const canonicalCourseKey = (label?: string): Promise<string | null> => {
    const c = (label ?? '').trim();
    if (!c || !courses?.byCode) return Promise.resolve(null);
    if (!courseKeyCache.has(c)) {
      courseKeyCache.set(
        c,
        Promise.resolve(courses.byCode(c))
          .then((e) => e?.key ?? null)
          .catch(() => null),
      );
    }
    return courseKeyCache.get(c)!;
  };
  const courseForNote = async (n: Note): Promise<{ course?: string; courseId?: string }> => {
    /* structured binding wins over tag inference */
    if (n.courseId) return { course: n.course, courseId: n.courseId };
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
  /* keys whose last put failed/quarantined, keyed to their rejected wire
     shape — retried when the shape changes, never in a hot loop (margin's
     adapter settled this contract first) */
  const failedPublishes = new Map<string, string>();
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
        if (published.delete(key)) {
          /* keep the key queued on a failed remove — the next drain retries
             instead of ghosting the entity in Search */
          const ok = await store.remove(key).then(() => true).catch(() => false);
          if (!ok) { published.set(key, ''); removed.add(key); }
        }
      }
      for (const id of [...dirty]) {
        dirty.delete(id);
        const n = byId.get(id);
        if (!n || n.trashedAt) continue;
        const { course, courseId } = await courseForNote(n);
        const ent = noteEntity(n, { course, courseId });
        const j = JSON.stringify(ent);
        /* a live note supersedes a queued removal — a trash+restore inside
           one drain would otherwise remove the fresh entity */
        removed.delete(`ink:note:${id}`);
        if (published.get(`ink:note:${id}`) !== j && failedPublishes.get(`ink:note:${id}`) !== j) {
          /* mark published only once the store takes it — a rejected put
             that updated the marker was silently never retried. A rejected
             wire shape pins to failedPublishes so a permanently-bad entity
             doesn't retry every diff, but a CHANGED shape still gets its
             second chance. */
          const r = await store.put(ent).catch(() => null);
          if (r && (r as { ok?: boolean }).ok !== false) {
            published.set(`ink:note:${id}`, j);
            failedPublishes.delete(`ink:note:${id}`);
          } else {
            failedPublishes.set(`ink:note:${id}`, j);
          }
        }
      }
      /* a failed wire shape whose note is gone must be forgotten — a later
         re-create with identical content should get a fresh attempt */
      const liveIds = new Set(s.notes.filter((n) => !n.trashedAt).map((n) => n.id));
      for (const key of [...failedPublishes.keys()]) {
        const id = key.slice('ink:note:'.length);
        if (!liveIds.has(id)) failedPublishes.delete(key);
      }
    }).catch(() => {}).finally(() => {
      queued = false;
      if (dirty.size || removed.size) drain();
    });
  };

  let seenNoteIds: Set<string> | null = null;
  const emitNew = () => {
    const ids = new Set(liveNotes().map((n) => n.id));
    if (seenNoteIds && events?.emit) {
      for (const n of liveNotes()) {
        if (!seenNoteIds.has(n.id)) {
          events.emit('note.created', {
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
  let committedMirror = Promise.resolve();
  useStore.subscribe(() => {
    committedMirror = committedMirror.then(async () => {
      await flushNativeStore('ink-notes-storage');
      diff();
      drain();
      emitNew();
    }).catch((error) => {
      console.warn('Ink changes are waiting for local persistence before publishing:', error);
    });
  });

  adapter({
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
      'note.create': async (rec: IntakeRecord) => {
        /* a boot drain can claim the intake before zustand persist has
           rehydrated — a note written now would be stomped by hydration.
           Wait; throw on timeout so the hub releases the claim. */
        await whenHydrated();
        const title = rec?.entity?.title || `From ${rec?.from ?? 'the terrain'}`;
        const text = typeof rec?.payload?.text === 'string' ? rec.payload.text.trim() : '';
        /* deterministic page id from the intake record — the hub can hand
           one record to several racing drains; a re-run resolves to the
           page it already made instead of cloning it (margin/proof do the
           same with their intake-derived ids) */
        const id = useStore.getState().addNote({
          id: typeof rec?.id === 'string' && rec.id ? `intake-${rec.id}` : undefined,
          title,
          content: intakeDoc(rec),
          wordCount: text ? text.split(/\s+/).length : 0,
          /* the sent entity's course binding follows the note into the
             dossier — a card made from a MTH deck lands filed under MTH;
             a bare course entity IS the course (its key is canonical) */
          ...(() => {
            const ent = rec?.entity;
            const cid = ent?.type === 'course'
              ? ent.courseId ?? ent.key ?? ent.id
              : ent?.courseId;
            return typeof cid === 'string'
              ? { courseId: cid, course: ent?.course ?? (ent?.type === 'course' ? ent?.title : undefined) }
              : {};
          })(),
        });
        await flushNativeStore('ink-notes-storage');
        /* provenance: the new page was derived FROM the sent entity — the
           relationship edge is what dossiers/search show, not just the
           'From <app>' title. Mirrors cards.create's derived links. */
        const srcKey = typeof rec?.entity?.key === 'string' ? rec.entity.key : null;
        if (srcKey) {
          try { await (window as any).iterra?.links?.add(`ink:note:${id}`, srcKey, 'derivedFrom'); } catch { /* best effort */ }
        }
        return { url: `/apps/ink/?note=${id}` };
      },
    },
    wake: () => { diff(); drain(); },
  });
}

if (typeof window !== 'undefined') registerAdapter();
