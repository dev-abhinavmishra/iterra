import type { Note } from '../types';

const DB_NAME = 'ModularAINotesDB';
const DB_VERSION = 3;
export const NOTES_STORE = 'notes';
export const SETTINGS_STORE = 'settings';
export const VERSIONS_STORE = 'versions';
export const DECKS_STORE = 'decks';
export const QUIZZES_STORE = 'quizzes';

export const openDB = (): Promise<IDBDatabase> => {
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

/* Resolve on TRANSACTION completion, not request success: a request's
   onsuccess fires before the write is committed, so callers chaining a read
   (or a cloud push of "what was just saved") could observe a transaction that
   later aborts. Same contract as the hub's idbTx. */
export const tx = async <T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await openDB();
    try {
        return await new Promise<T>((resolve, reject) => {
            const transaction = db.transaction([storeName], mode);
            const request = fn(transaction.objectStore(storeName));
            let result: T;
            request.onsuccess = () => { result = request.result; };
            request.onerror = () => reject(request.error);
            transaction.oncomplete = () => resolve(result);
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
    } finally {
        db.close();
    }
};

const NOTE_TYPES = new Set(['AUDIO', 'PDF', 'VIDEO', 'TEXT', 'IMAGE']);

/* A record that can't satisfy the Note shape is dropped here rather than
   crashing every consumer downstream (a single bad row used to brick the app). */
export const isNoteRecord = (n: any): n is Note =>
    !!n && typeof n.id === 'string' && typeof n.content === 'string' && NOTE_TYPES.has(n.type);

export const getLocalNote = async (id: string): Promise<Note | undefined> => {
    const note = await tx(NOTES_STORE, 'readonly', store => store.get(id));
    return isNoteRecord(note) ? note : undefined;
};
