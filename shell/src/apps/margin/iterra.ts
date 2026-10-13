/* iterra bridge — registers the Margin as a place and feeds the terrain its
   live summary. The App supplies the source getter; no store mutation here. */
import { useEffect, useState } from 'react';
import type { Deck, Note, Quiz } from './types';
import { getAllDecks, getAllQuizzes } from './services/storageService';

/* window.iterra's global declaration lives in shell/src/hub.ts — the shared
   type surface covers every member this file calls. */

let source: (() => { notes: Note[] }) | null = null;

export function setMarginSource(fn: () => { notes: Note[] }) {
    source = fn;
}

/* The canonical-store adapter rides the ambient tick below — exported so
   its writes stay incremental without a second poller. */
const snapshotListeners = new Set<() => void>();
export function onMarginSnapshot(cb: () => void): () => void {
    snapshotListeners.add(cb);
    return () => { snapshotListeners.delete(cb); };
}
export function marginNotes(): Note[] {
    return source?.().notes ?? [];
}

export function wireMargin() {
    const iterra = window.iterra;
    if (!iterra) return;
    iterra.register('margin', {
        title: 'Margin',
        // the margin's own ⌘K palette stays its own — terrain yields it
        ownKeys: ['k'],
        summary: () => {
            if (!source) return null;
            const { notes } = source();
            if (!notes?.length) return { notes: 0 };
            const last = [...notes].sort(
                (a, b) => new Date(b.lastAccessed || 0).getTime() - new Date(a.lastAccessed || 0).getTime(),
            )[0];
            return { notes: notes.length, last: last?.title || undefined };
        },
    });
}

wireMargin();

/* ambient layer — commons noteActive, note index, feed on new notes (§7) */
let myLastWriteAt = 0;
(() => {
    const it = window.iterra;
    if (!it?.doc) return;
    const shared = it.doc('shared');
    if (!shared) return;
    const indexDoc = it.doc('index.margin');
    let lastCommons = '', lastEntities = '', lastIds: Set<string> | null = null;
    const publish = () => {
    publishInner().catch((e) => {
      console.warn("iterra ambient publish failed:", e);
    }).finally(() => {
      for (const cb of snapshotListeners) { try { cb(); } catch { /* listener owns its errors */ } }
    });
  };
  const publishInner = async () => {
        if (!source) return;
        const { notes } = source();
        if (!notes?.length) return;
        const last = [...notes].sort(
            (a, b) => new Date(b.lastAccessed || 0).getTime() - new Date(a.lastAccessed || 0).getTime(),
        )[0];
        /* v carries app+id so a sibling desk can offer a real ?note= link; v.at
           is the note's own access time so sibling arbitration follows real
           write order, not which frame mounted last (§7). */
        const v = last?.title ? { app: 'margin', id: last.id, title: last.title, at: new Date(last.lastAccessed || Date.now()).getTime() } : null;
        const j = JSON.stringify(v);
        if (j !== lastCommons) {
            lastCommons = j;
            /* myLastWriteAt tracks the note's own access time, matching v.at —
               a mount-republish of the same note doesn't make us artificially fresher */
            myLastWriteAt = v ? v.at : Date.now();
            shared.setField?.('noteActive', { v, by: 'margin', at: Date.now() });
        }
        const [decks, quizzes] = await Promise.all([
            getAllDecks().catch(() => []),
            getAllQuizzes().catch(() => []),
        ]);
        const entities = [
            ...notes.slice(0, 50).map((n: Note) => ({
                t: 'note', id: n.id, title: n.title || 'untitled', sub: n.type,
                url: `/apps/margin/?note=${n.id}`, at: new Date(n.lastAccessed || Date.now()).getTime(),
            })),
            ...decks.slice(0, 50).map((d: Deck) => ({
                t: 'deck', id: d.id, title: d.title || 'untitled deck', sub: `${d.cards?.length ?? 0} cards`,
                url: `/apps/margin/?deck=${d.id}`, at: new Date(d.createdAt || Date.now()).getTime(),
            })),
            ...quizzes.slice(0, 50).map((q: Quiz) => ({
                t: 'quiz', id: q.id, title: q.title || 'untitled quiz', sub: `${q.questions?.length ?? 0} questions`,
                url: `/apps/margin/?quiz=${q.id}`, at: new Date(q.createdAt || Date.now()).getTime(),
            })),
        ];
        const ej = JSON.stringify(entities);
        if (ej !== lastEntities) { lastEntities = ej; indexDoc.set({ entities }); }
        const ids = new Set<string>(notes.map((n: Note) => n.id));
        /* baseline is the first publish that actually sees notes — an empty
           first call just means IndexedDB hasn't answered yet, and locking in
           {} would re-announce the seeded 'Getting started' on every remount. */
        if (lastIds === null && notes.length === 0) return;
        if (lastIds) for (const n of notes) if (!lastIds.has(n.id)) {
            it.feed?.({ text: `margin note: ${n.title || 'untitled'}`, url: `/apps/margin/?note=${n.id}` });
        }
        lastIds = ids;
    };
    setInterval(publish, 3000);
    publish();
    /* sibling readers (ink's desk, the ambient rail) drop a noteActive
       stamp older than 5min — a live desk holding an idle note must keep
       beating or it reads as dead. Re-stamp `at` only, and never over a
       sibling's fresh stamp: arbitration still follows v.at, an idle
       heartbeat mustn't clobber a live ink note with an older margin one. */
    setInterval(() => {
        try {
            const v = lastCommons ? JSON.parse(lastCommons) : null;
            const cur = (shared.get() as { noteActive?: { by?: string; at?: number } | null } | null)?.noteActive;
            const siblingFresh = cur && cur.by !== 'margin' && Date.now() - (cur.at || 0) < 5 * 60 * 1000;
            if (v && !siblingFresh) shared.setField?.('noteActive', { v, by: 'margin', at: Date.now() });
        } catch { /* housekeeping beat — never throw */ }
    }, 2 * 60 * 1000);
})();

interface NoteActiveEntry {
    v: { app: string; id: string; title: string; at?: number } | null;
    by: string;
    at: number;
}

/* commons read: shared.noteActive — show the sibling notes app's active note
   only when their stamp is fresher than our own last write and not leftover
   (>5min). Entry carries the sibling's own store id so ?note= resolves. */
export function useOtherNoteActive(): NoteActiveEntry | null {
    const [entry, setEntry] = useState<NoteActiveEntry | null>(null);
    useEffect(() => {
        const shared = window.iterra?.doc?.('shared');
        if (!shared) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const read = (doc: unknown) => {
            const e = (doc as { noteActive?: NoteActiveEntry } | null)?.noteActive ?? null;
            clearTimeout(timer);
            if (!e || typeof e !== 'object') { setEntry(null); return; }
            /* staleness decided at read time + a timer to drop it when the 5-min
               window closes — keeps Date.now() out of the render path */
            const remaining = 5 * 60_000 - (Date.now() - e.at);
            if (remaining <= 0) { setEntry(null); return; }
            setEntry(e);
            timer = setTimeout(() => setEntry(null), remaining);
        };
        read(shared.get());
        const unsub = shared.subscribe(read);
        return () => { clearTimeout(timer); unsub(); };
    }, []);
    const v = entry?.v;
    if (!v || v.app !== 'ink') return null;
    /* arbitrate on the note's own write time (v.at) when present — mount
       restamps entry.at, but v.at follows real edits (§7). */
    const theirs = v.at ?? entry!.at;
    if (theirs <= myLastWriteAt) return null;
    return entry;
}
import './iterra-adapter';
