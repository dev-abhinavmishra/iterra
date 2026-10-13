import { Note, Deck, Quiz, NoteVersion, Attachment } from '../types';
import { getAllNotes, getAllDecks, getAllQuizzes, getAllNoteVersions, saveNote, saveDeck, saveQuiz, putNoteVersions } from './storageService';
import { sanitizeHtml } from './sanitize';

/* Minimal HTML → Markdown for note export. Handles the elements the AI writer
   and the editor actually produce. */
export const htmlToMarkdown = (html: string): string => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const esc = (s: string) => s.replace(/\s+/g, ' ').trim();

    const walk = (node: Node): string => {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
        if (node.nodeType !== Node.ELEMENT_NODE) return '';
        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();
        const kids = () => Array.from(el.childNodes).map(walk).join('');
        switch (tag) {
            case 'h1': return `# ${kids()}\n\n`;
            case 'h2': return `## ${kids()}\n\n`;
            case 'h3': return `### ${kids()}\n\n`;
            case 'h4': return `#### ${kids()}\n\n`;
            case 'p': case 'div': return `${kids()}\n\n`;
            case 'br': return '\n';
            case 'b': case 'strong': return `**${kids()}**`;
            case 'i': case 'em': return `*${kids()}*`;
            case 'u': return kids();
            case 's': case 'strike': case 'del': return `~~${kids()}~~`;
            case 'mark': return `==${kids()}==`;
            case 'code': return el.parentElement?.tagName === 'PRE' ? el.textContent || '' : `\`${el.textContent || ''}\``;
            case 'pre': return `\`\`\`\n${el.textContent || ''}\n\`\`\`\n\n`;
            case 'blockquote': return kids().split('\n').map(l => l.trim() ? `> ${l.trim()}` : '').join('\n') + '\n\n';
            case 'ul': case 'ol': {
                const ordered = tag === 'ol';
                let i = 1;
                return Array.from(el.children).map(li =>
                    `${ordered ? `${i++}.` : '-'} ${walk(li).trim()}\n`
                ).join('') + '\n';
            }
            case 'li': return kids();
            case 'hr': return `---\n\n`;
            case 'a': return `[${kids() || el.getAttribute('href') || ''}](${el.getAttribute('href') || ''})`;
            case 'img': return `![${el.getAttribute('alt') || 'image'}](${el.getAttribute('src') || ''})`;
            case 'table': {
                const rows = Array.from(el.querySelectorAll('tr')).map(tr =>
                    Array.from(tr.querySelectorAll('th,td')).map(c => esc(c.textContent || '')).join(' | ')
                );
                if (rows.length === 0) return '';
                const header = `| ${rows[0]} |`;
                const sep = '|' + rows[0].split('|').map(() => '---').join('|') + '|';
                const body = rows.slice(1).map(r => `| ${r} |`).join('\n');
                return `${header}\n${sep}\n${body}\n\n`;
            }
            default: return kids();
        }
    };
    return Array.from(doc.body.childNodes).map(walk).join('').replace(/\n{3,}/g, '\n\n').trim() + '\n';
};

export const noteToMarkdown = (note: Note): string => {
    const meta = `---\ntitle: ${note.title}\ndate: ${note.date}\ntype: ${note.type.toLowerCase()}\ntags: [${note.tags.map(t => `"${t}"`).join(', ')}]\n---\n\n`;
    return meta + htmlToMarkdown(note.content || '');
};

const download = (filename: string, text: string, mime = 'text/plain') => {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
};

const slugify = (s: string) => s.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 60) || 'note';

export const exportNoteMarkdown = (note: Note) =>
    download(`${slugify(note.title)}.md`, noteToMarkdown(note), 'text/markdown');

const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const exportNoteHtml = (note: Note) => {
    const safeTitle = escapeHtml(note.title || 'Untitled');
    const safeContent = sanitizeHtml(note.content || '');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${safeTitle}</title>
<style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;padding:0 24px;color:#211E19;line-height:1.65}
h1,h2,h3{font-family:'Helvetica Neue',Arial,sans-serif;letter-spacing:-0.02em}
blockquote{border-left:2px solid #C2420C;padding-left:.9em;font-style:italic;color:#5C574B}
code{background:#EFECE2;border-radius:4px;padding:.1em .35em;font-size:.85em}
pre{background:#EFECE2;border-radius:8px;padding:12px 14px;overflow-x:auto}
mark{background:rgba(58,92,140,.15);padding:0 .15em}
table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #DDD8C8;padding:6px 8px;text-align:left}
img{max-width:100%}</style></head><body>
<h1>${safeTitle}</h1><p style="color:#8A8375;font-size:13px">${note.date}${note.duration ? ' · ' + note.duration : ''} · Margin</p>
${safeContent}</body></html>`;
    download(`${slugify(note.title)}.html`, html, 'text/html');
};

export interface BackupPayload {
    app: 'margin' | 'longhand' | 'modular-ai-notes';
    version: 1;
    exportedAt: string;
    notes: Note[];
    decks: Deck[];
    quizzes: Quiz[];
    versions?: NoteVersion[];
}

export const exportBackup = async () => {
    const payload: BackupPayload = {
        app: 'margin',
        version: 1,
        exportedAt: new Date().toISOString(),
        notes: await getAllNotes(),
        decks: await getAllDecks(),
        quizzes: await getAllQuizzes(),
        versions: await getAllNoteVersions(),
    };
    download(`margin-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json');
};

const NOTE_TYPES = new Set(['AUDIO', 'PDF', 'VIDEO', 'TEXT', 'IMAGE']);

/* One malformed record must never brick the library — skip entries that
   don't satisfy the minimum shape instead of storing them verbatim. */
const isValidNote = (n: any): n is Note =>
    !!n && typeof n.id === 'string' && n.id.length > 0 &&
    typeof n.title === 'string' &&
    typeof n.content === 'string' &&
    typeof n.date === 'string' &&
    typeof n.type === 'string' && NOTE_TYPES.has(n.type) &&
    Array.isArray(n.tags);

const isValidAttachment = (a: any): a is Attachment =>
    !!a && (a.type === 'image' || a.type === 'text' || a.type === 'pdf') &&
    typeof a.content === 'string' && typeof a.name === 'string';

/* The file is untrusted input: coerce out any junk nested inside a record
   that passed the shape check rather than storing it verbatim. */
const sanitizeNote = (n: Note): Note => {
    n.tags = n.tags.filter((t: any) => typeof t === 'string');
    if (n.attachments !== undefined) {
        if (!Array.isArray(n.attachments)) delete n.attachments;
        else n.attachments = n.attachments.filter(isValidAttachment);
    }
    if (n.pinnedMoments !== undefined && !Array.isArray(n.pinnedMoments)) delete n.pinnedMoments;
    if (n.sourceData !== undefined &&
        (!n.sourceData || typeof n.sourceData.mimeType !== 'string' || typeof n.sourceData.data !== 'string')) {
        delete n.sourceData;
    }
    return n;
};

const isValidCard = (c: any): boolean =>
    !!c && typeof c.id === 'string' && typeof c.front === 'string' && typeof c.back === 'string';

const isValidDeck = (d: any): d is Deck =>
    !!d && typeof d.id === 'string' && typeof d.title === 'string' &&
    Array.isArray(d.cards) && d.cards.every(isValidCard);

const isValidQuestion = (q: any): boolean =>
    !!q && typeof q.question === 'string' &&
    Array.isArray(q.options) && q.options.every((o: any) => typeof o === 'string') &&
    typeof q.answer === 'string';

const isValidQuiz = (q: any): q is Quiz =>
    !!q && typeof q.id === 'string' && typeof q.title === 'string' &&
    Array.isArray(q.questions) && q.questions.every(isValidQuestion);

const isValidVersion = (v: any): v is NoteVersion =>
    !!v && typeof v.id === 'string' && typeof v.noteId === 'string' && typeof v.content === 'string';

/** Import a backup file. Returns counts of restored + skipped entities. */
export const importBackup = async (file: File): Promise<{ notes: number; decks: number; quizzes: number; skipped: number }> => {
    const text = await file.text();
    const data = JSON.parse(text);
    if ((data?.app !== 'margin' && data?.app !== 'longhand' && data?.app !== 'modular-ai-notes') || !Array.isArray(data.notes)) {
        throw new Error('Not a Margin backup file.');
    }
    let skipped = 0;
    let notes = 0;
    for (const n of data.notes) {
        if (isValidNote(n)) { await saveNote(sanitizeNote(n)); notes++; } else skipped++;
    }
    let decks = 0;
    for (const d of (data.decks || [])) {
        if (isValidDeck(d)) { await saveDeck(d); decks++; } else skipped++;
    }
    let quizzes = 0;
    for (const q of (data.quizzes || [])) {
        if (isValidQuiz(q)) {
            if (!Array.isArray(q.attempts)) q.attempts = []; // older backups may lack it
            await saveQuiz(q);
            quizzes++;
        } else skipped++;
    }
    if (Array.isArray(data.versions)) {
        await putNoteVersions((data.versions as any[]).filter(isValidVersion));
    }
    return { notes, decks, quizzes, skipped };
};
