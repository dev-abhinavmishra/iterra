/* Notes handoff — Study Materials stores and organizes; the Notes app
   (ink) owns note authoring. This module is the one door for "take this
   material into Notes":

   • integrated (terrain): 'iterra:modal' kind 'attach-ink' — the shell's
     AttachToInkModal lets the user review/edit the seeded page and course
     before it lands in ink, with margin:note:<id> provenance linked.
   • hub without the terrain chrome: a 'note.create' intake to ink, then
     navigate to the returned deep link.
   • no hub at all: open the ink place directly — there's nothing to seed.

   newNoteInNotes() is the blank-page equivalent: authoring starts in ink. */
import type { Note } from '../types';
import { extractPlainTextFromMarginNote } from '../../../integration/identity';

const iterra = () => (window as unknown as { iterra?: any }).iterra;
const integrated = () => !!(window as any).__iterraIntegrated;

const openUrl = (url: string) => {
    try {
        const it = iterra();
        if (it?.open) { it.open(url); return; }
    } catch { /* fall through */ }
    try { window.open(url, '_blank'); } catch { /* popup blocked — nothing more to do */ }
};

const toast = (text: string) => {
    try {
        window.dispatchEvent(new CustomEvent('iterra:toast', { detail: { text } }));
    } catch { /* ambient listener absent */ }
};

/** Plain-text body handed to ink — the refined content first, the raw
    transcript when the content carries nothing readable. */
export function materialText(note: Note): string {
    const text = extractPlainTextFromMarginNote(note).trim();
    if (text) return text;
    return (note.transcript || '').trim();
}

const sourceRefFor = (note: Note) => ({
    app: 'margin',
    type: 'note',
    id: note.id,
    title: note.title || 'untitled',
    ...(note.course ? { course: note.course } : {}),
    ...(note.courseId ? { courseId: note.courseId } : {}),
});

/** Open a stored material in the Notes app for editing. Never mutates the
    margin copy — ink's page is seeded from the material's text. */
export function openMaterialInNotes(note: Note): void {
    const title = note.title || 'Untitled material';
    const text = materialText(note);

    if (integrated()) {
        window.dispatchEvent(new CustomEvent('iterra:modal', {
            detail: {
                kind: 'attach-ink',
                sourceRef: sourceRefFor(note),
                sourceTitle: title,
                initialText: text,
                sourceRevision: note.lastAccessed ?? note.date,
                initialCourse: note.course,
                initialTopic: note.tags?.[0],
            },
        }));
        return;
    }

    const it = iterra();
    if (it?.send) {
        void it.send({
            to: 'ink',
            action: 'note.create',
            entity: sourceRefFor(note),
            payload: {
                text,
                ...(note.course ? { course: note.course } : {}),
                ...(note.courseId ? { courseId: note.courseId } : {}),
            },
        }).then((res: any) => {
            if (res && res.ok !== false && res.url) { openUrl(res.url); return; }
            toast(res?.toast || 'Notes didn’t take the material — try again.');
        }).catch(() => toast('Notes didn’t take the material — try again.'));
        return;
    }

    /* No hub: the ink place still exists as a route — open it plainly. */
    try { window.location.hash = '#/p/ink'; }
    catch { window.open('/apps/ink/', '_blank'); }
}

/** "New note" now means "new page in Notes" — margin stores materials,
    it doesn't author pages. Seeds a blank ink page when the hub is up so
    the user lands mid-keystroke instead of on an empty shelf. */
export function newNoteInNotes(): void {
    const it = iterra();
    if (it?.send) {
        void it.send({
            to: 'ink',
            action: 'note.create',
            entity: { app: 'margin', type: 'note', id: `new-${Date.now()}`, title: 'Untitled note' },
            payload: {},
        }).then((res: any) => {
            if (res && res.ok !== false && res.url) { openUrl(res.url); return; }
            openUrl('/apps/ink/');
        }).catch(() => openUrl('/apps/ink/'));
        return;
    }
    openUrl('/apps/ink/');
}
