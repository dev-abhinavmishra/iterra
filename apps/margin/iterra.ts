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
