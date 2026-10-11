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
