import { describe, it, expect } from 'vitest';
import { parseImportPayload } from './import';

const GOOD = {
  source: 'modular',
  courseName: 'Roman History',
  code: 'HIST140',
  commitments: [
    { type: 'exam', title: 'Midterm', dueAt: '2027-03-04', weight: 30, estimatedMinutes: 360 },
    { type: 'assignment', title: 'Gracchi essay', due: '03/11/2027', weight: 15, minutes: 180 },
    { title: 'Weekly quiz', dueDate: '2027-03-06', recur: true },
    { type: 'nope', title: 'Bad row — no date', weight: 5 },
    { title: '   ' },
  ],
};

describe('parseImportPayload', () => {
  it('parses a JSON payload, normalizing types/dates/aliases, dropping invalid rows', () => {
    const r = parseImportPayload(JSON.stringify(GOOD));
    expect(r.ok).toBe(true);
    const p = r.payload!;
    expect(p.courseName).toBe('Roman History');
    expect(p.code).toBe('HIST140');
    expect(p.rows).toHaveLength(3);
    expect(r.dropped).toBe(2);
    const [mid, essay, quiz] = p.rows;
    expect(mid.type).toBe('exam');
    expect(mid.dueAt).toMatch(/^2027-03-04/);
    expect(mid.accepted).toBe(true);
    expect(essay.dueAt).toMatch(/^2027-03-1/); // mm/dd parsed to March
    expect(quiz.recur).toBe(true);
    expect(quiz.type).toBe('assignment'); // unknown type falls back
  });

  it('accepts base64url payloads (the deep-link form)', () => {
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(GOOD)))).replace(/\+/g, '-').replace(/\//g, '_');
    const r = parseImportPayload(b64);
    expect(r.ok).toBe(true);
    expect(r.payload!.rows).toHaveLength(3);
  });

  it('rejects empty / non-json / row-less payloads without throwing', () => {
    expect(parseImportPayload('').ok).toBe(false);
    expect(parseImportPayload('not json or b64').ok).toBe(false);
    expect(parseImportPayload('{"hello":1}').ok).toBe(false);
    expect(parseImportPayload('{"commitments":[{"title":""}]}').ok).toBe(false);
  });

  it('clamps weight/minutes into sane ranges', () => {
    const r = parseImportPayload(
      JSON.stringify({ commitments: [{ title: 'X', dueAt: '2027-01-01', weight: 400, estimatedMinutes: -5 }] }),
    );
    expect(r.payload!.rows[0].weight).toBe(100);
    expect(r.payload!.rows[0].estimatedMinutes).toBe(0);
  });
});
