import React, { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import * as mammoth from 'mammoth';
import { Note } from '../../types';
import { generateNoteFromTranscript, processDocument, transcribeAudio } from '../../services/aiService';
import { extractPdfText } from '../../services/pdfService';
import { Btn, Icon, ProgressBar, Spinner } from '../ui/primitives';

export type ImportPhase = 'reading' | 'extracting' | 'transcribing' | 'structuring' | 'done' | 'error';

export interface ImportItem {
    name: string;
    phase: ImportPhase;
    progress: number; // 0-100 while reading
    error?: string;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB — inline base64 ceiling
export const IMPORT_ACCEPT = '.pdf,.docx,.txt,.md,.jpg,.jpeg,.png,.webp,.mp3,.wav,.m4a';

const PHASE_LABEL: Record<ImportPhase, string> = {
    reading: 'reading',
    extracting: 'extracting text',
    transcribing: 'transcribing',
    structuring: 'writing notes',
    done: 'done',
    error: 'failed',
};

const newNoteId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* Plain text → paragraph HTML for imported notes. Keeps the file's own
   words verbatim — an import must never rewrite (or lose) the source. */
const textToNoteHtml = (text: string): string => {
    const blocks = text.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
    if (blocks.length === 0) return '<p></p>';
    // Keep leading indentation verbatim (code, lists) — HTML collapses it.
    const preserveIndent = (line: string) =>
        line.replace(/^[\t ]+/, ws => ws.replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;').replace(/ /g, '&nbsp;'));
    return blocks
        .map(b => `<p>${escapeHtml(b).split('\n').map(preserveIndent).join('<br/>')}</p>`)
        .join('');
};

/* Try the AI structuring pass; fall back to the verbatim text so a provider
   outage still imports the file's real content instead of an error body. */
const structureOrVerbatim = async (text: string, title?: string): Promise<{ content: string; aiFailed: boolean }> => {
    try {
        return { content: await generateNoteFromTranscript(text, title), aiFailed: false };
    } catch {
        return { content: textToNoteHtml(text), aiFailed: true };
    }
};

const readFileAsBase64 = (f: File, onProgress: (pct: number) => void): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onprogress = (event) => {
            if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
        };
        reader.onload = () => resolve((reader.result as string).split(',')[1] || '');
        reader.onerror = reject;
        reader.readAsDataURL(f);
    });

/** One file → one Note. Same pipeline the old drop zone used; images now save type IMAGE. */
const processFile = async (file: File, onPhase: (phase: ImportPhase, progress?: number) => void): Promise<Note> => {
    if (file.size > MAX_FILE_SIZE) {
        throw new Error(`Too large (${(file.size / 1024 / 1024).toFixed(1)}MB) — the limit is 20MB.`);
    }

    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    const isText = file.type === 'text/plain' || file.name.endsWith('.md') || file.name.endsWith('.txt');
    const isDocx = file.name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const isAudio = file.type.startsWith('audio/');

    const base: Pick<Note, 'id' | 'date' | 'tags'> = {
        id: newNoteId(),
        date: new Date().toLocaleDateString(),
        tags: ['Imported'],
    };

    if (isPdf) {
        const base64Data = await readFileAsBase64(file, p => onPhase('reading', p));
        onPhase('extracting');
        const extractedText = await extractPdfText(file);
        if (!extractedText || extractedText.length < 20) {
            throw new Error('This PDF looks scanned or image-only — try exporting a page as an image.');
        }
        onPhase('structuring');
        const { content } = await structureOrVerbatim(extractedText.substring(0, 100000), file.name);
        return {
            ...base,
            title: file.name.replace(/\.pdf$/i, ''),
            content,
            transcript: extractedText,
            type: 'PDF',
            tags: ['Imported', 'PDF'],
            sourceData: { mimeType: 'application/pdf', data: base64Data },
        };
    }

    if (isImage) {
        const base64Data = await readFileAsBase64(file, p => onPhase('reading', p));
        onPhase('structuring');
        const result = await processDocument(base64Data, file.type, file.name);
        return {
            ...base,
            title: result.title,
            content: `<img src="data:${file.type};base64,${base64Data}" style="max-width:100%; border-radius: 8px; margin-bottom: 1em;" />` + result.content,
            transcript: result.transcript,
            type: 'IMAGE',
            tags: ['Imported', 'Image'],
            sourceData: { mimeType: file.type, data: base64Data },
        };
    }

    if (isAudio) {
        const base64Data = await readFileAsBase64(file, p => onPhase('reading', p));
        onPhase('transcribing');
        const transcript = await transcribeAudio(base64Data, file.type, file.name);
        if (!transcript || transcript.trim().length < 5) {
            throw new Error('Could not detect any speech in this audio file.');
        }
        onPhase('structuring');
        const { content } = await structureOrVerbatim(transcript.substring(0, 100000), file.name);
        return {
            ...base,
            title: file.name.replace(/\.[^.]+$/, ''),
            content,
            transcript,
            type: 'AUDIO',
            tags: ['Imported', 'Audio'],
            sourceData: { mimeType: file.type, data: base64Data },
        };
    }

    if (isText) {
        // Text/markdown imports are verbatim — no AI call, no quota spent.
        const text = await file.text();
        onPhase('structuring');
        return { ...base, title: file.name, content: textToNoteHtml(text), transcript: text, type: 'TEXT', tags: ['Imported', 'Text'] };
    }

    if (isDocx) {
        const arrayBuffer = await file.arrayBuffer();
        onPhase('extracting');
        const text = (await mammoth.extractRawText({ arrayBuffer })).value;
        onPhase('structuring');
        const { content } = await structureOrVerbatim(text.substring(0, 20000), file.name);
        return { ...base, title: file.name, content, transcript: text, type: 'TEXT', tags: ['Imported', 'Word Doc'] };
    }

    throw new Error('Unsupported type — use PDF, Word, image, audio, or text files.');
};

export interface NoteImport {
    items: ImportItem[] | null;
    finished: boolean; // all files processed, at least one error (waiting on dismiss)
    start: (files: File[]) => void;
    dismiss: () => void;
    running: boolean;
}

/**
 * Sequential file → note queue. Successes are handed to onImport together at the
 * end (App saves + opens the last one); failures stay visible until dismissed.
 */
export const useNoteImport = (onImport: (note: Note) => void): NoteImport => {
    const [items, setItems] = useState<ImportItem[] | null>(null);
    const [finished, setFinished] = useState(false);
    const runningRef = useRef(false);
    const importedRef = useRef<Note[]>([]);

    const patchItem = (index: number, patch: Partial<ImportItem>) =>
        setItems(prev => (prev ? prev.map((it, i) => (i === index ? { ...it, ...patch } : it)) : prev));

    const flush = useCallback(() => {
        const notes = importedRef.current;
        importedRef.current = [];
        setItems(null);
        setFinished(false);
        runningRef.current = false;
        notes.forEach(onImport);
    }, [onImport]);

    const start = useCallback(async (files: File[]) => {
        if (runningRef.current || files.length === 0) return;
        runningRef.current = true;
        importedRef.current = [];
        setFinished(false);
        setItems(files.map(f => ({ name: f.name, phase: 'reading', progress: 0 })));

        let failures = 0;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            try {
                const note = await processFile(file, (phase, progress) =>
                    patchItem(i, { phase, progress: progress ?? undefined }));
                importedRef.current.push(note);
                patchItem(i, { phase: 'done', progress: 100 });
            } catch (err) {
                failures++;
                patchItem(i, { phase: 'error', error: err instanceof Error ? err.message : 'Could not read this file.' });
            }
        }

        if (failures > 0) {
            setFinished(true); // waits for dismiss; successes still flush then
        } else {
            window.setTimeout(flush, 650);
        }
    }, [flush]);

    return { items, finished, start, dismiss: flush, running: runningRef.current };
};

/* ---------- visuals ---------- */

const DropVeil: React.FC = () => (
    <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="absolute inset-0 z-40 flex items-center justify-center bg-paper p-6"
    >
        <div className="w-full max-w-lg rounded-[var(--r-lg)] border-2 border-dashed border-[var(--mark)] bg-[var(--card)] shadow-pop px-8 py-14 flex flex-col items-center text-center">
            <Icon name="upload_file" size={30} className="text-mark mb-4" />
            <p className="font-serif text-xl text-ink ink-write">Drop files to import</p>
            <p className="text-sm text-ink-2 mt-1.5">PDF, Word, image, audio, or text — up to 20MB each.</p>
            <div className="flex gap-1.5 mt-4 flex-wrap justify-center">
                {['.pdf', '.docx', '.txt', '.jpg', '.mp3'].map(ext => (
                    <span key={ext} className="font-mono text-[10px] text-ink-3 border border-line-2 rounded px-1.5 py-0.5">{ext}</span>
                ))}
            </div>
        </div>
    </motion.div>
);

const ImportOverlay: React.FC<{
    items: ImportItem[] | null;
    finished: boolean;
    dragging: boolean;
    onDismiss: () => void;
}> = ({ items, finished, dragging, onDismiss }) => (
    <AnimatePresence>
        {dragging && !items && <DropVeil key="veil" />}
        {items && (
            <motion.div
                key="queue"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-[90] bg-black/45 flex items-center justify-center p-4"
            >
                <motion.div
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                    className="w-full max-w-md bg-card border border-line-2 rounded-[var(--r-lg)] shadow-pop overflow-hidden"
                >
                    <div className="px-5 pt-4 pb-3 border-b border-line flex items-baseline justify-between">
                        <h3 className="font-serif text-lg text-ink">
                            {finished ? 'Import finished' : 'Importing'}
                        </h3>
                        <span className="font-mono text-[11px] text-ink-3">
                            {items.filter(i => i.phase === 'done').length}/{items.length}
                        </span>
                    </div>
                    <ul className="max-h-72 overflow-y-auto custom-scrollbar">
                        {items.map((item, i) => (
                            <li key={i} className="px-5 py-3 border-t border-line first:border-t-0">
                                <div className="flex items-center gap-3">
                                    <span className="w-5 shrink-0 flex justify-center">
                                        {item.phase === 'done' ? (
                                            <Icon name="check" size={16} className="text-ok" />
                                        ) : item.phase === 'error' ? (
                                            <Icon name="error" size={16} className="text-bad" />
                                        ) : (
                                            <Spinner size={14} />
                                        )}
                                    </span>
                                    <span className="flex-1 min-w-0 truncate text-sm text-ink">{item.name}</span>
                                    <span className={`font-mono text-[11px] shrink-0 ${item.phase === 'error' ? 'text-bad' : item.phase === 'done' ? 'text-ok' : 'text-ink-3'}`}>
                                        {item.phase === 'reading' ? `${item.progress}%` : PHASE_LABEL[item.phase]}
                                    </span>
                                </div>
                                {item.phase === 'reading' && <ProgressBar value={item.progress} className="mt-2 ml-8" />}
                                {item.phase === 'error' && item.error && (
                                    <p className="mt-1.5 ml-8 text-xs text-bad">{item.error}</p>
                                )}
                            </li>
                        ))}
                    </ul>
                    {finished && (
                        <div className="px-5 py-3.5 border-t border-line flex items-center justify-between">
                            <span className="text-xs text-ink-2">
                                {items.some(i => i.phase === 'done')
                                    ? 'Finished files were saved to your notes.'
                                    : 'Nothing was imported.'}
                            </span>
                            <Btn size="sm" onClick={onDismiss}>Done</Btn>
                        </div>
                    )}
                </motion.div>
            </motion.div>
        )}
    </AnimatePresence>
);

export default ImportOverlay;
