/* iterra bridge — the desk reports the open page to the terrain and honors
   inbound /apps/ink/?note=<id> links from sibling places. */
import { useStore } from '../store';

declare global {
  interface Window {
    iterra?: { register(app: string, opts: { title?: string; summary?: () => unknown }): void };
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
    const v = open ? { title: open.title || 'untitled' } : null;
    const j = JSON.stringify(v);
    if (j !== lastCommons) { lastCommons = j; shared.setField('noteActive', { v, by: 'ink', at: Date.now() }); }
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
