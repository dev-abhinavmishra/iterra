/* iterra bridge — registers the Margin as a place and feeds the terrain its
   live summary. The App supplies the source getter; no store mutation here. */
import { useEffect, useState } from 'react';
import type { Note } from './types';
import { getAllDecks, getAllQuizzes } from './services/storageService';

declare global {
    interface Window {
        iterra?: {
            register(app: string, opts: { title?: string; summary?: () => unknown }): void;
            isFramed(): boolean;
            doc?: (ns: string) => {
                get: () => unknown;
                set: (v: unknown) => void;
                setField: (field: string, v: unknown) => void;
                subscribe: (cb: (v: unknown) => void) => () => void;
            };
        };
    }
}

let source: (() => { notes: Note[] }) | null = null;

export function setMarginSource(fn: () => { notes: Note[] }) {
    source = fn;
}

export function wireMargin() {
    const iterra = window.iterra;
    if (!iterra) return;
    iterra.register('margin', {
        title: 'Margin',
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
    const it: any = (window as any).iterra;
    if (!it) return;
    const shared = it.doc('shared');
    const indexDoc = it.doc('index.margin');
    let lastCommons = '', lastEntities = '', lastIds: Set<string> | null = null;
    const publish = () => {
    publishInner().catch((e) => {
      console.warn("iterra ambient publish failed:", e);
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
            shared.setField('noteActive', { v, by: 'margin', at: Date.now() });
        }
        const [decks, quizzes] = await Promise.all([
            getAllDecks().catch(() => []),
            getAllQuizzes().catch(() => []),
        ]);
        const entities = [
            ...notes.slice(0, 50).map((n: any) => ({
                t: 'note', id: n.id, title: n.title || 'untitled', sub: n.subject,
                url: `/apps/margin/?note=${n.id}`, at: new Date(n.lastAccessed || Date.now()).getTime(),
            })),
            ...decks.slice(0, 50).map((d: any) => ({
                t: 'deck', id: d.id, title: d.title || 'untitled deck', sub: `${d.cards?.length ?? 0} cards`,
                url: `/apps/margin/?deck=${d.id}`, at: new Date(d.createdAt || Date.now()).getTime(),
            })),
            ...quizzes.slice(0, 50).map((q: any) => ({
                t: 'quiz', id: q.id, title: q.title || 'untitled quiz', sub: `${q.questions?.length ?? 0} questions`,
                url: `/apps/margin/?quiz=${q.id}`, at: new Date(q.createdAt || Date.now()).getTime(),
            })),
        ];
        const ej = JSON.stringify(entities);
        if (ej !== lastEntities) { lastEntities = ej; indexDoc.set({ entities }); }
        const ids = new Set<string>(notes.map((n: any) => n.id));
        /* baseline is the first publish that actually sees notes — an empty
           first call just means IndexedDB hasn't answered yet, and locking in
           {} would re-announce the seeded 'Getting started' on every remount. */
        if (lastIds === null && notes.length === 0) return;
        if (lastIds) for (const n of notes) if (!lastIds.has(n.id)) {
            it.feed({ text: `margin note: ${n.title || 'untitled'}`, url: `/apps/margin/?note=${n.id}` });
        }
        lastIds = ids;
    };
    setInterval(publish, 3000);
    publish();
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
        const read = (doc: unknown) => {
            const e = (doc as { noteActive?: NoteActiveEntry } | null)?.noteActive ?? null;
            setEntry(e && typeof e === 'object' ? e : null);
        };
        read(shared.get());
        return shared.subscribe(read);
    }, []);
    const v = entry?.v;
    if (!v || v.app !== 'ink') return null;
    /* arbitrate on the note's own write time (v.at) when present — mount
       restamps entry.at, but v.at follows real edits (§7). */
    const theirs = v.at ?? entry!.at;
    if (theirs <= myLastWriteAt || Date.now() - entry!.at > 5 * 60_000) return null;
    return entry;
}