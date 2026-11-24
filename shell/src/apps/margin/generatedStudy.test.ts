// Contract pin — generated-study provenance + normalization helpers.
// Pure functions only: no IndexedDB, no window, no network.
import { describe, expect, it } from 'vitest';
import type { Note } from './types';
import {
    excerptFor,
    htmlToText,
    normalizeGeneratedCards,
    normalizeGeneratedQuestions,
    sourceForItem,
    sourceLabelFor,
    sourceTextFor,
} from './services/generatedStudy';

const note = (over: Partial<Note> = {}): Note => ({
    id: 'n1',
    title: 'Lecture 3',
    date: 'Oct 11, 2026',
    content: '<p>Body</p>',
    transcript: '',
    type: 'AUDIO',
    tags: [],
    duration: '12:04',
    ...over,
});

describe('htmlToText / sourceTextFor', () => {
    it('strips markup and keeps block breaks', () => {
        expect(htmlToText('<h1>Title</h1><p>Hello <b>world</b></p>')).toBe('Title\nHello world');
        expect(htmlToText('<p>a</p><p>b</p>')).toContain('a');
        expect(htmlToText('<p>a</p><p>b</p>')).toContain('b');
    });

    it('prefers the transcript over note content', () => {
        const n = note({ transcript: 'spoken words', content: '<p>typed words</p>' });
        expect(sourceTextFor(n)).toBe('spoken words');
        expect(sourceTextFor(note({ transcript: '  ', content: '<p>typed</p>' }))).toBe('typed');
    });
});

describe('sourceLabelFor', () => {
    it('joins title, type, date and recording duration', () => {
        expect(sourceLabelFor(note())).toBe('Lecture 3 · audio · Oct 11, 2026 · 12:04');
    });

    it('omits duration for non-recordings and falls back on empty title', () => {
        expect(sourceLabelFor(note({ type: 'PDF', duration: undefined }))).toBe('Lecture 3 · pdf · Oct 11, 2026');
        expect(sourceLabelFor(note({ title: '' }))).toContain('untitled note');
    });
});

describe('excerptFor', () => {
    const transcript = [
        'Welcome back to the lecture on cellular respiration.',
        'Glycolysis splits glucose into two pyruvate molecules in the cytoplasm.',
        'The Krebs cycle then oxidizes pyruvate inside the mitochondrial matrix.',
        'Oxidative phosphorylation produces the bulk of ATP through chemiosmosis.',
    ].join('\n');

    it('returns a verbatim passage that covers the item', () => {
        const ex = excerptFor('How does glycolysis process glucose?', transcript);
        expect(ex).toBeTruthy();
        expect(transcript).toContain(ex!.replace(/…$/, ''));
        expect(ex).toContain('Glycolysis');
    });

    it('returns null when nothing in the source supports the item', () => {
        expect(excerptFor('quantum chromodynamics lattice gauge theory', transcript)).toBeNull();
    });

    it('returns null for empty inputs', () => {
        expect(excerptFor('', transcript)).toBeNull();
        expect(excerptFor('glucose', '')).toBeNull();
    });

    it('never fabricates: excerpt is always a substring of the source', () => {
        const ex = excerptFor('ATP production via oxidative phosphorylation', transcript);
        expect(ex).toBeTruthy();
        expect(transcript.replace(/\s+/g, ' ')).toContain(ex!.replace(/…$/, '').replace(/\s+/g, ' ').trim());
    });
});

describe('sourceForItem', () => {
    it('always carries the note label; excerpt only when matched', () => {
        const n = note({ transcript: 'Glycolysis happens in the cytoplasm.' });
        const hit = sourceForItem('glycolysis cytoplasm process', n);
        expect(hit?.label).toBe(sourceLabelFor(n));
        expect(hit?.excerpt).toBeTruthy();

        const miss = sourceForItem('unrelated zanzibar quokka fact', n);
        expect(miss?.label).toBe(sourceLabelFor(n));
        expect(miss?.excerpt).toBeUndefined();
    });

    it('returns undefined without a note', () => {
        expect(sourceForItem('anything', null)).toBeUndefined();
        expect(sourceForItem('anything', undefined)).toBeUndefined();
    });
});

describe('normalizeGeneratedCards', () => {
    it('accepts arrays, {cards} wrappers and single objects; trims and drops empties', () => {
        expect(normalizeGeneratedCards([{ front: ' a ', back: ' b ' }])).toEqual([{ front: 'a', back: 'b' }]);
        expect(normalizeGeneratedCards({ cards: [{ front: 'f', back: 'b' }] })).toHaveLength(1);
        expect(normalizeGeneratedCards({ front: 'f', back: 'b' })).toHaveLength(1);
        expect(normalizeGeneratedCards([{ front: '', back: 'b' }, { front: 'f' }, null])).toEqual([]);
        expect(normalizeGeneratedCards('junk')).toEqual([]);
    });

    it('preserves a well-formed source and drops a malformed one', () => {
        const good = normalizeGeneratedCards([{ front: 'f', back: 'b', source: { label: 'L', excerpt: 'e' } }]);
        expect(good[0].source).toEqual({ label: 'L', excerpt: 'e' });
        const bad = normalizeGeneratedCards([{ front: 'f', back: 'b', source: { label: 42 } }]);
        expect(bad[0].source).toBeUndefined();
    });
});

describe('normalizeGeneratedQuestions', () => {
    it('keeps valid questions and normalizes the answer to option text', () => {
        const qs = normalizeGeneratedQuestions([
            { question: 'Q?', options: ['alpha', 'beta'], answer: 'alpha' },
            { question: 'Q2?', options: ['x', 'y'], answer: 'B' }, // letter form
            { question: 'bad', options: ['only'], answer: 'only' }, // too few options
            { question: 'unanswerable', options: ['p', 'q'], answer: 'zzz' },
        ]);
        expect(qs).toHaveLength(2);
        expect(qs[0].answer).toBe('alpha');
        expect(qs[1].answer).toBe('y');
    });

    it('accepts a {questions} wrapper and preserves source', () => {
        const qs = normalizeGeneratedQuestions({
            questions: [{ question: 'Q?', options: ['a', 'b'], answer: 'a', source: { label: 'L' } }],
        });
        expect(qs[0].source).toEqual({ label: 'L' });
    });
});
