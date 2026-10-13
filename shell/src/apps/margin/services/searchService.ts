import { Note } from '../types';

const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'by', 'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that', 'these',
    'those', 'as', 'from', 'not', 'no', 'so', 'if', 'then', 'than', 'too', 'very', 'can',
    'will', 'just', 'about', 'into', 'over', 'after', 'you', 'your', 'we', 'our', 'they',
    'their', 'he', 'she', 'his', 'her', 'i', 'me', 'my', 'do', 'does', 'did', 'have',
    'has', 'had', 'what', 'when', 'where', 'which', 'who', 'how', 'all', 'any', 'some',
]);

export const tokenize = (text: string): Map<string, number> => {
    const terms = new Map<string, number>();
    const words = text
        .toLowerCase()
        .replace(/<[^>]*>/g, ' ')
        .match(/[a-z0-9][a-z0-9'-]{2,}/g) || [];
    for (const w of words) {
        if (STOP_WORDS.has(w)) continue;
        terms.set(w, (terms.get(w) || 0) + 1);
    }
    return terms;
};

const cosine = (a: Map<string, number>, b: Map<string, number>): number => {
    let dot = 0, na = 0, nb = 0;
    for (const v of a.values()) na += v * v;
    for (const v of b.values()) nb += v * v;
    if (!na || !nb) return 0;
    const [small, large] = a.size <= b.size ? [a, b] : [b, a];
    for (const [term, va] of small) {
        const vb = large.get(term);
        if (vb) dot += va * vb;
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
};

const noteText = (n: Note): string =>
    `${n.title} ${n.transcript || ''} ${(n.tags || []).join(' ')}`;

/** Client-side TF similarity — no API needed. Returns notes most similar to `note`. */
export const relatedNotes = (note: Note, all: Note[], limit = 4): { note: Note; score: number }[] => {
    const vec = tokenize(noteText(note));
    return all
        .filter(n => n.id !== note.id)
        .map(n => ({ note: n, score: cosine(vec, tokenize(noteText(n))) }))
        .filter(r => r.score > 0.05)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
};

/** Full-text-ish search across notes (title, transcript, content, tags). */
export const searchNotes = (all: Note[], query: string): Note[] => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    const terms = q.split(/\s+/);
    return all.filter(n => {
        const hay = `${n.title}\n${n.transcript || ''}\n${(n.tags || []).join(' ')}\n${(n.content || '').replace(/<[^>]*>/g, ' ')}`.toLowerCase();
        return terms.every(t => hay.includes(t));
    });
};
