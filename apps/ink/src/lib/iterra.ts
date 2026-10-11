/* iterra bridge — the desk reports the open page to the terrain and honors
   inbound /apps/ink/?note=<id> links from sibling places. */
import { useEffect, useState } from 'react';
import { useStore } from '../store';

declare global {
  interface Window {
    iterra?: {
    register(app: string, opts: { title?: string; summary?: () => unknown }): void;
    doc?: (ns: string) => {
      get: () => unknown;
      set: (v: unknown) => void;
      setField: (field: string, v: unknown) => void;
      subscribe: (cb: (v: unknown) => void) => () => void;
    };
  };
  }
}

function applyInboundLink() {
  const id = new URLSearchParams(window.location.search).get('note');
  if (!id) return;
  window.history.replaceState(null, '', window.location.pathname);
  const { notes, setActiveNote } = useStore.getState();
  if (notes.some((n) => n.id === id && !n.trashedAt)) {
    setActiveNote(id);
  }
}

export function wireIterra() {
  const iterra = window.iterra;
  if (!iterra) return;
  iterra.register('ink', {
    title: 'Ink',
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
  });
  applyInboundLink();
}

/* ambient layer — commons noteActive, note index, feed on new notes (§7) */
let myLastWriteAt = 0;
(() => {
  const it: any = (window as any).iterra;
  if (!it) return;
  const shared = it.doc('shared');
  const indexDoc = it.doc('index.ink');
  let lastCommons = '', lastEntities = '', lastIds: Set<string> | null = null;
  const publish = () => {
    try {
      publishInner();
    } catch (e) {
      console.warn("iterra ambient publish failed:", e);
    }
  };
  const publishInner = () => {
    const { notes, activeNoteId } = useStore.getState() as any;
    const live = notes.filter((n: any) => !n.trashedAt);
    const open = live.find((n: any) => n.id === activeNoteId);
    /* v carries app+id so a sibling desk can offer a real ?note= link; v.at
       is the note's own write time so sibling arbitration follows real edit
       order, not which frame mounted last (§7). */
    const v = open ? { app: 'ink', id: open.id, title: open.title || 'untitled', at: open.lastModified ?? Date.now() } : null;
    const j = JSON.stringify(v);
    if (j !== lastCommons) {
      lastCommons = j;
      /* myLastWriteAt tracks the note's own write time, matching v.at — a
         mount-republish of the same note doesn't make us artificially fresher */
      myLastWriteAt = open?.lastModified ?? Date.now();
      shared.setField('noteActive', { v, by: 'ink', at: Date.now() });
    }
    const entities = live.slice(0, 50).map((n: any) => ({
      t: 'note', id: n.id, title: n.title || 'untitled', sub: n.folder,
      url: `/apps/ink/?note=${n.id}`, at: n.lastModified,
    }));
    const ej = JSON.stringify(entities);
    if (ej !== lastEntities) { lastEntities = ej; indexDoc.set({ entities }); }
    const ids = new Set<string>(live.map((n: any) => n.id));
    if (lastIds) for (const n of live) if (!lastIds.has(n.id)) {
      it.feed({ text: `note set down: ${n.title || 'untitled'}`, url: `/apps/ink/?note=${n.id}` });
    }
    lastIds = ids;
  };
  useStore.subscribe(publish);
  if (useStore.persist?.hasHydrated?.()) publish();
  else useStore.persist?.onFinishHydration?.(publish);
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
  const activeId = useStore((s: any) => s.activeNoteId);
  const v = entry?.v;
  if (!v || v.app !== 'margin') return null;
  if (!v.id || v.id === activeId) return null;
  /* arbitrate on the note's own write time (v.at) when present — mount
     restamps entry.at, but v.at follows real edits (§7). */
  const theirs = v.at ?? entry!.at;
  if (theirs <= myLastWriteAt || Date.now() - entry!.at > 5 * 60_000) return null;
  return entry;
}
