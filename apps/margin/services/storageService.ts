import { Note, AppSettings, NoteVersion, Deck, Quiz } from '../types';

const DB_NAME = 'ModularAINotesDB';
const DB_VERSION = 3;
const NOTES_STORE = 'notes';
const SETTINGS_STORE = 'settings';
const VERSIONS_STORE = 'versions';
const DECKS_STORE = 'decks';
const QUIZZES_STORE = 'quizzes';

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(NOTES_STORE)) {
                db.createObjectStore(NOTES_STORE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
                db.createObjectStore(SETTINGS_STORE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(VERSIONS_STORE)) {
                db.createObjectStore(VERSIONS_STORE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(DECKS_STORE)) {
                db.createObjectStore(DECKS_STORE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(QUIZZES_STORE)) {
                db.createObjectStore(QUIZZES_STORE, { keyPath: 'id' });
            }
        };

        request.onsuccess = () => resolve(request.result);
    });
};

const tx = async <T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await openDB();
    return new Promise<T>((resolve, reject) => {
        const transaction = db.transaction([storeName], mode);
        const request = fn(transaction.objectStore(storeName));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const initDB = async (): Promise<void> => {
    await openDB();
};

// Cloud Sync Helpers
const syncNoteToCloud = async (note: Note) => {
    try {
        await fetch('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(note)
        });
    } catch (err) {
        console.error("Cloud sync failed (save)", err);
    }
};

const deleteNoteFromCloud = async (id: string) => {
    try {
        await fetch('/api/notes', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
    } catch (err) {
        console.error("Cloud sync failed (delete)", err);
    }
};

export const saveNote = async (note: Note): Promise<void> => {
    await tx(NOTES_STORE, 'readwrite', s => s.put(note));
    // Sync to cloud in background
    syncNoteToCloud(note);
};

export const deleteNote = async (id: string): Promise<void> => {
    await tx(NOTES_STORE, 'readwrite', s => s.delete(id));
    await deleteNoteVersions(id).catch(() => {});
    // Sync to cloud in background
    deleteNoteFromCloud(id);
};

const NOTE_TYPES = new Set(['AUDIO', 'PDF', 'VIDEO', 'TEXT', 'IMAGE']);

/* A record that can't satisfy the Note shape is dropped here rather than
   crashing every consumer downstream (a single bad row used to brick the app). */
const isNoteRecord = (n: any): n is Note =>
    !!n && typeof n.id === 'string' && typeof n.content === 'string' && NOTE_TYPES.has(n.type);

export const getAllNotes = async (): Promise<Note[]> => {
    const rawNotes = await tx(NOTES_STORE, 'readonly', s => s.getAll() as IDBRequest<Note[]>);
    const localNotes = (rawNotes || []).filter(isNoteRecord);

    // If local is empty, try to fetch from cloud (one-time sync)
    if (localNotes.length === 0) {
        try {
            const res = await fetch('/api/notes');
            if (res.ok) {
                const cloudNotes = await res.json();
                if (cloudNotes && cloudNotes.length > 0) {
                    // Map back from snake_case to camelCase
                    const mappedNotes: Note[] = cloudNotes.map((n: any) => ({
                        ...n,
                        isBookmarked: n.is_bookmarked,
                        lastAccessed: n.last_accessed,
                        sourceData: n.source_data
                    })).filter(isNoteRecord);

                    for (const note of mappedNotes) {
                        await tx(NOTES_STORE, 'readwrite', s => s.put(note));
                    }

                    mappedNotes.sort((a, b) => {
                        const dateA = a.lastAccessed ? new Date(a.lastAccessed).getTime() : 0;
                        const dateB = b.lastAccessed ? new Date(b.lastAccessed).getTime() : 0;
                        return dateB - dateA;
                    });
                    return mappedNotes;
                }
            }
        } catch (err) {
            console.error("Cloud fetch failed", err);
        }
    }

    localNotes.sort((a, b) => {
        const dateA = a.lastAccessed ? new Date(a.lastAccessed).getTime() : 0;
        const dateB = b.lastAccessed ? new Date(b.lastAccessed).getTime() : 0;
        return dateB - dateA;
    });
    return localNotes;
};

export const saveSettings = async (settings: AppSettings): Promise<void> => {
    await tx(SETTINGS_STORE, 'readwrite', s => s.put({ id: 'app_settings', ...settings }));
};

export const getSettings = async (): Promise<AppSettings | null> => {
    const result = await tx(SETTINGS_STORE, 'readonly', s => s.get('app_settings'));
    if (result) {
        const { id, ...settings } = result as any;
        return settings as AppSettings;
    }
    return null;
};

export const deleteNotesBefore = async (date: Date): Promise<number> => {
    const notes = await tx(NOTES_STORE, 'readonly', s => s.getAll() as IDBRequest<Note[]>);
    let deleted = 0;
    for (const note of notes) {
        const lastAccessed = note.lastAccessed ? new Date(note.lastAccessed) : new Date(0);
        if (lastAccessed < date) {
            await tx(NOTES_STORE, 'readwrite', s => s.delete(note.id));
            await deleteNoteVersions(note.id).catch(() => {});
            deleted++;
        }
    }
    return deleted;
};

export const clearAllNotes = async (): Promise<void> => {
    await tx(NOTES_STORE, 'readwrite', s => s.clear());
    await tx(VERSIONS_STORE, 'readwrite', s => s.clear());
};

/* ---------- Note versions (history snapshots) ---------- */

const MAX_VERSIONS_PER_NOTE = 30;

export const saveNoteVersion = async (note: Note): Promise<void> => {
    const version: NoteVersion = {
        id: `${note.id}:${Date.now()}`,
        noteId: note.id,
        title: note.title,
        content: note.content,
        savedAt: new Date().toISOString()
    };
    await tx(VERSIONS_STORE, 'readwrite', s => s.put(version));
    // Trim old versions beyond the cap
    const all = await getNoteVersions(note.id);
    if (all.length > MAX_VERSIONS_PER_NOTE) {
        const excess = all.slice(MAX_VERSIONS_PER_NOTE);
        for (const v of excess) {
            await tx(VERSIONS_STORE, 'readwrite', s => s.delete(v.id));
        }
    }
};

export const getNoteVersions = async (noteId: string): Promise<NoteVersion[]> => {
    const all = await tx(VERSIONS_STORE, 'readonly', s => s.getAll() as IDBRequest<NoteVersion[]>);
    return all
        .filter(v => v.noteId === noteId)
        .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
};

export const getAllNoteVersions = async (): Promise<NoteVersion[]> =>
    tx(VERSIONS_STORE, 'readonly', s => s.getAll() as IDBRequest<NoteVersion[]>);

/* Restore version records verbatim (backup import) — unlike saveNoteVersion,
   which mints a fresh id/timestamp. */
export const putNoteVersions = async (versions: NoteVersion[]): Promise<void> => {
    for (const v of versions) {
        await tx(VERSIONS_STORE, 'readwrite', s => s.put(v));
    }
};

export const deleteNoteVersions = async (noteId: string): Promise<void> => {
    const all = await getNoteVersions(noteId);
    for (const v of all) {
        await tx(VERSIONS_STORE, 'readwrite', s => s.delete(v.id));
    }
};

/* ---------- Study: decks & quizzes ---------- */

export const saveDeck = async (deck: Deck): Promise<void> => {
    await tx(DECKS_STORE, 'readwrite', s => s.put(deck));
};

export const getAllDecks = async (): Promise<Deck[]> => {
    const decks = await tx(DECKS_STORE, 'readonly', s => s.getAll() as IDBRequest<Deck[]>);
    return (decks || []).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

export const deleteDeck = async (id: string): Promise<void> => {
    await tx(DECKS_STORE, 'readwrite', s => s.delete(id));
};

export const saveQuiz = async (quiz: Quiz): Promise<void> => {
    await tx(QUIZZES_STORE, 'readwrite', s => s.put(quiz));
};

export const getAllQuizzes = async (): Promise<Quiz[]> => {
    const quizzes = await tx(QUIZZES_STORE, 'readonly', s => s.getAll() as IDBRequest<Quiz[]>);
    return (quizzes || []).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

export const deleteQuiz = async (id: string): Promise<void> => {
    await tx(QUIZZES_STORE, 'readwrite', s => s.delete(id));
};

/* ---------- Storage estimate ---------- */

export const storageEstimate = async (): Promise<{ usage: number; quota: number } | null> => {
    try {
        if (navigator.storage?.estimate) {
            const est = await navigator.storage.estimate();
            return { usage: est.usage || 0, quota: est.quota || 0 };
        }
    } catch { /* ignore */ }
    return null;
};

export const migrateFromLocalStorage = async (): Promise<boolean> => {
    try {
        const localNotes = localStorage.getItem('app_notes');
        const localSettings = localStorage.getItem('app_settings');

        let migrated = false;

        if (localNotes) {
            const notes = JSON.parse(localNotes) as Note[];
            for (const note of notes) {
                await saveNote(note);
            }
            localStorage.removeItem('app_notes');
            migrated = true;
        }

        if (localSettings) {
            const settings = JSON.parse(localSettings) as AppSettings;
            await saveSettings(settings);
            localStorage.removeItem('app_settings');
            migrated = true;
        }

        return migrated;
    } catch (e) {
        console.error("Migration failed", e);
        return false;
    }
};
