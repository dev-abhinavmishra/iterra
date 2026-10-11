/* iterra bridge — registers the Margin as a place and feeds the terrain its
   live summary. The App supplies the source getter; no store mutation here. */
import type { Note } from './types';

declare global {
    interface Window {
        iterra?: {
            register(app: string, opts: { title?: string; summary?: () => unknown }): void;
            isFramed(): boolean;
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
(() => {
    const it: any = (window as any).iterra;
    if (!it) return;
    const shared = it.doc('shared');
    const indexDoc = it.doc('index.margin');
    let lastCommons = '', lastEntities = '', lastIds: Set<string> | null = null;
    const publish = () => {
        if (!source) return;
        const { notes } = source();
        if (!notes?.length) return;
        const last = [...notes].sort(
            (a, b) => new Date(b.lastAccessed || 0).getTime() - new Date(a.lastAccessed || 0).getTime(),
        )[0];
        const v = last?.title ? { title: last.title } : null;
        const j = JSON.stringify(v);
        if (j !== lastCommons) { lastCommons = j; shared.setField('noteActive', { v, by: 'margin', at: Date.now() }); }
        const entities = notes.slice(0, 50).map((n: any) => ({
            t: 'note', id: n.id, title: n.title || 'untitled', sub: n.subject,
            url: `/apps/margin/?note=${n.id}`, at: new Date(n.lastAccessed || Date.now()).getTime(),
        }));
        const ej = JSON.stringify(entities);
        if (ej !== lastEntities) { lastEntities = ej; indexDoc.set({ entities }); }
        const ids = new Set<string>(notes.map((n: any) => n.id));
        if (lastIds) for (const n of notes) if (!lastIds.has(n.id)) {
            it.feed({ text: `margin note: ${n.title || 'untitled'}`, url: '/apps/margin/' });
        }
        lastIds = ids;
    };
    setInterval(publish, 3000);
    publish();
})();
