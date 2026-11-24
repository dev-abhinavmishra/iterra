import { GeneratedSource, Note, QuizQuestion } from '../types';
import { correctOptionIndex } from './studyService';

/* Pure helpers for the generate → review → deck pipeline. Everything here
   is honest by construction: citations are either real metadata (note
   title/type/date) or verbatim text lifted from the note's own
   transcript/content — the /api/action pipeline returns no page or
   timestamp locators, so none are invented. */

/** Note content is stored as HTML; reduce it to readable plain text for
    excerpt matching. Regex-based on purpose — this module stays DOM-free
    so it runs under vitest's node environment. */
export const htmlToText = (html: string): string =>
    (html || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6]|blockquote|pre|tr|section|article|ul|ol)>/gi, '\n')
        .replace(/<li[^>]*>/gi, '• ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;|&apos;/g, "'")
        .replace(/[ \t]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .trim();

/** The text a generated item was actually built from: the transcript when
    the note has one (recordings, imports), else the readable note body. */
export const sourceTextFor = (note: Note): string => {
    const t = (note.transcript || '').trim();
    return t || htmlToText(note.content || '');
};

/** Human-readable provenance line for a note, e.g.
    'Lecture 3 · audio · Oct 11, 2026 · 12:04'. */
export const sourceLabelFor = (note: Note): string => {
    const bits = [
        (note.title || '').trim() || 'untitled note',
        (note.type || 'note').toLowerCase(),
        note.date,
    ].filter(Boolean) as string[];
    if ((note.type === 'AUDIO' || note.type === 'VIDEO') && note.duration) {
        bits.push(note.duration);
    }
    return bits.join(' · ');
};

const tokens = (s: string): string[] =>
    s.toLowerCase().match(/[a-z0-9]+/g) || [];

/* Tiny stopword set — matching on content words keeps a one-word card front
   from "matching" every passage that happens to contain it. */
const STOP = new Set([
    'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'are', 'was', 'were',
    'for', 'on', 'with', 'as', 'at', 'by', 'that', 'this', 'it', 'its', 'be',
    'from', 'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how',
    'does', 'do', 'did', 'can', 'could', 'should', 'would', 'about', 'into',
]);

const contentTokens = (s: string): Set<string> =>
    new Set(tokens(s).filter(t => t.length > 2 && !STOP.has(t)));

/* Split source text into candidate passages: lines first, then sentences
   inside long lines. Passages stay small enough to read as a citation. */
const passages = (text: string): string[] => {
    const out: string[] = [];
    for (const line of text.split(/\n+/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.length <= 320) {
            out.push(trimmed);
            continue;
        }
        // Long line: break on sentence ends, packing ~≤320-char chunks.
        const sentences = trimmed.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [trimmed];
        let buf = '';
        for (const s of sentences) {
            if (buf && (buf + ' ' + s.trim()).length > 320) {
                out.push(buf.trim());
                buf = '';
            }
            buf += (buf ? ' ' : '') + s.trim();
        }
        if (buf.trim()) out.push(buf.trim());
    }
    return out;
};

const EXCERPT_MAX = 220;

/** Best verbatim excerpt of `sourceText` supporting `itemText`, or null.
    Scores each passage by recall over the item's content words and only
    returns text that literally appears in the source — paraphrased model
    output never counts as a citation. */
export const excerptFor = (itemText: string, sourceText: string): string | null => {
    const want = contentTokens(itemText);
    if (want.size === 0 || !sourceText.trim()) return null;

    let best: string | null = null;
    let bestScore = 0;
    for (const p of passages(sourceText)) {
        const have = contentTokens(p);
        if (have.size === 0) continue;
        let hit = 0;
        for (const t of want) if (have.has(t)) hit++;
        const score = hit / want.size;
        // Prefer coverage, then density (a short passage that covers the item
        // beats a whole paragraph that mentions it once).
        const density = hit / Math.sqrt(have.size);
        const rank = score * 2 + density * 0.25;
        /* Coverage ≥ half the item's content words, and at least two hits —
           or the item's full (tiny) vocabulary when it only has one or two
           content words, so a one-word card front can still cite. */
        if (score >= 0.5 && hit >= Math.min(2, want.size) && rank > bestScore) {
            bestScore = rank;
            best = p;
        }
    }
    if (!best) return null;
    const flat = best.replace(/\s+/g, ' ').trim();
    return flat.length > EXCERPT_MAX ? flat.slice(0, EXCERPT_MAX - 1).trimEnd() + '…' : flat;
};

const isGeneratedSource = (v: unknown): v is GeneratedSource =>
    !!v && typeof v === 'object'
    && typeof (v as GeneratedSource).label === 'string'
    && (v as GeneratedSource).label.trim().length > 0
    && ((v as GeneratedSource).excerpt === undefined || typeof (v as GeneratedSource).excerpt === 'string');

/** Provenance for one generated item: the note's honest label plus a
    verbatim excerpt when the item's text overlaps the source. Returns
    undefined for a missing note — callers fall back to a generic
    'AI-generated' label rather than inventing a source. */
export const sourceForItem = (itemText: string, note: Note | null | undefined): GeneratedSource | undefined => {
    if (!note) return undefined;
    const label = sourceLabelFor(note);
    const excerpt = excerptFor(itemText, sourceTextFor(note));
    return excerpt ? { label, excerpt } : { label };
};

/* ---- generated-item normalization (shared by StudyView + widgets) ---- */

export interface GeneratedCardItem {
    front: string;
    back: string;
    source?: GeneratedSource;
}

/** Parse output → clean {front, back} cards. Accepts a bare array, a
    {cards:[…]} wrapper, or a single card object; trims and drops empties. */
export const normalizeGeneratedCards = (raw: unknown): GeneratedCardItem[] => {
    const list = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as any)?.cards)
            ? (raw as any).cards
            : (raw && typeof raw === 'object' && typeof (raw as any).front === 'string' && typeof (raw as any).back === 'string')
                ? [raw]
                : [];
    return (list as any[])
        .filter(c => c && typeof c.front === 'string' && typeof c.back === 'string')
        .map(c => ({
            front: c.front.trim(),
            back: c.back.trim(),
            ...(isGeneratedSource(c.source) ? { source: c.source } : {}),
        }))
        .filter(c => c.front.length > 0 && c.back.length > 0);
};

/** Parse output → clean QuizQuestions. Keeps only questions whose answer
    resolves to an option, normalized to the option's exact text so grading
    can't miss (same rule StudyView used inline). */
export const normalizeGeneratedQuestions = (raw: unknown): QuizQuestion[] => {
    const list = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as any)?.questions)
            ? (raw as any).questions
            : [];
    return (list as any[])
        .filter(q => q && typeof q.question === 'string' && Array.isArray(q.options)
            && q.options.length >= 2 && typeof q.answer === 'string')
        .map(q => {
            const i = correctOptionIndex(q.options, q.answer);
            if (i === -1) return null;
            return {
                question: q.question,
                options: q.options.map((o: unknown) => String(o)),
                answer: q.options[i],
                ...(isGeneratedSource(q.source) ? { source: q.source } : {}),
            } as QuizQuestion;
        })
        .filter((q): q is QuizQuestion => q !== null);
};
