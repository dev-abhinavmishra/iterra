import { Note, AppSettings, NoteVersion, Deck, Quiz } from '../types';
import { getAccessToken, getUserId } from './usageService';

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

/* Resolve on TRANSACTION completion, not request success: a request's
   onsuccess fires before the write is committed, so callers chaining a read
   (or a cloud push of "what was just saved") could observe a transaction that
   later aborts. Same contract as the hub's idbTx. */
const tx = async <T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await openDB();
    return new Promise<T>((resolve, reject) => {
        const transaction = db.transaction([storeName], mode);
        const request = fn(transaction.objectStore(storeName));
        let result: T;
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });
};

export const initDB = async (): Promise<void> => {
    await openDB();
};

// Cloud Sync Helpers
//
// /api/notes is user-scoped and requires the Supabase anonymous-auth JWT —
// without a session the cloud endpoints are closed and the notes simply stay
// local (the app is local-first by design).
const cloudHeaders = async (): Promise<Record<string, string> | null> => {
    const token = await getAccessToken();
    if (!token) return null;
    return {
        'Content-Type': 'application/json',
        'x-user-id': getUserId(),
        Authorization: `Bearer ${token}`,
    };
};

/* Vercel caps function request bodies at ~4.5MB, and a recorded note's
   sourceData audio alone can exceed that — a blind POST 413s at the
   platform edge and the WHOLE row is dropped. Over the budget, drop the
   audio payload but still sync the note itself: title, content and
   transcript reach the cloud; only the audio stays local. */
const MAX_SYNC_BODY = 4 * 1024 * 1024;
const bodyBytes = (s: string) => new Blob([s]).size;

/* Persisted pending cloud SAVES — the write twin of pendingDeletes below.
   A POST that failed (offline, 5xx, an expired session mid-edit) used to be
   dropped on the floor: the note stayed local while the cloud copy went
   silently stale — and nothing ever retried it. Ids are owed until a 2xx
   lands; the flush re-reads the CURRENT local row (never a snapshot) so a
   stale body can't clobber a newer save. localStorage for the same reasons
   as the delete set: tiny, synchronous, survives reloads mid-write. */
const PENDING_SAVES_KEY = 'margin.pendingCloudSaves';
const pendingSaves = (): Set<string> => {
    try {
        const v = JSON.parse(localStorage.getItem(PENDING_SAVES_KEY) || '[]');
        return new Set(Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);
    } catch { return new Set(); }
};
const writePendingSaves = (s: Set<string>) => {
    try { localStorage.setItem(PENDING_SAVES_KEY, JSON.stringify([...s].slice(-500))); } catch { /* quota — best-effort */ }
};
const markPendingSaves = (ids: Iterable<string>) => {
    const s = pendingSaves();
    for (const id of ids) s.add(id);
    writePendingSaves(s);
};
const unmarkPendingSaves = (ids: Iterable<string>) => {
    const s = pendingSaves();
    let changed = false;
    for (const id of ids) if (s.delete(id)) changed = true;
    if (changed) writePendingSaves(s);
};

/* A deterministic client-reject (400/404/409/413/422) can never succeed on
   retry — owing it would just cost a doomed POST on every flush. Auth and
   transient statuses stay owed: the session refreshes, the network comes
   back, the server recovers. */
const RETRYABLE_SAVE = (status: number) =>
    !(status >= 400 && status < 500) || status === 401 || status === 403 || status === 408 || status === 429;

const syncNoteToCloud = async (note: Note) => {
    try {
        const headers = await cloudHeaders();
        /* unsigned or session dropped: the remote copy may exist from an
           earlier session and is now stale — owe the save so a future
           flush repairs it (a never-signed user's queue just idles at cap). */
        if (!headers) { markPendingSaves([note.id]); return; }
        let payload: Note = note;
        let body = JSON.stringify(payload);
        if (bodyBytes(body) > MAX_SYNC_BODY && note.sourceData?.data) {
            payload = { ...note, sourceData: { mimeType: note.sourceData.mimeType, data: '' } };
            body = JSON.stringify(payload);
            console.warn('[cloud] note too large for sync — sourceData media staying local:', note.id);
        }
        if (bodyBytes(body) > MAX_SYNC_BODY) {
            /* deterministic — it can never fit. Discharge the debt or an
               already-owed id would burn this same attempt on every flush. */
            unmarkPendingSaves([note.id]);
            console.warn('[cloud] note exceeds sync budget even without media — staying local:', note.id);
            return;
        }
        const res = await fetch('/api/notes', {
            method: 'POST',
            headers,
            body
        });
        if (res.ok) {
            unmarkPendingSaves([note.id]);
            /* a live cloud path is the best retry trigger: drain whatever
               else is owed, opportunistically (guarded, fire-and-forget) */
            void flushCloudDebts();
        } else if (RETRYABLE_SAVE(res.status)) {
            markPendingSaves([note.id]);
        } else {
            /* deterministic client-reject — it can never succeed on retry,
               so discharge it: an id that was already owed (earlier offline
               failure) would otherwise be re-POSTed on every flush forever */
            unmarkPendingSaves([note.id]);
            console.warn('[cloud] save rejected deterministically — not retrying:', note.id, res.status);
        }
    } catch (err) {
        markPendingSaves([note.id]);
        console.error("Cloud sync failed (save)", err);
    }
};

/* Re-push every owed save against CURRENT local state. Notes gone locally
   discharge their mark (a delete supersedes a save). Non-gating: owed saves
   never block the pull — the worst an unsynced remote can do is be stale. */
const flushPendingSaves = async (headers: Record<string, string>): Promise<void> => {
    const owed = [...pendingSaves()];
    for (const id of owed) {
        const n = await tx(NOTES_STORE, 'readonly', s => s.get(id) as IDBRequest<Note | undefined>).catch(() => undefined);
        if (n && isNoteRecord(n)) await syncNoteToCloud(n).catch(() => {});
        else unmarkPendingSaves([id]);
    }
};

/* Owed cloud ops drain on ANY live cloud interaction — a save that failed
   offline must not wait for the user to delete something (or hit the
   empty-local cold pull) before the mirror repairs. Fire-and-forget and
   re-entry-guarded: the flush itself calls syncNoteToCloud, whose success
   path calls back in here — the guard turns that into a no-op rather than
   recursion. */
let cloudFlushInFlight = false;
const flushCloudDebts = async (): Promise<void> => {
    if (cloudFlushInFlight) return;
    cloudFlushInFlight = true;
    try {
        const headers = await cloudHeaders();
        if (!headers) return;
        await flushPendingDeletes(headers);
        await flushPendingSaves(headers);
    } catch {
        /* best-effort drain — whatever fails stays owed for the next pass */
    } finally {
        cloudFlushInFlight = false;
    }
};

/* Persisted pending cloud deletions — ids (or the '*' wipe sentinel) whose
   server delete has not been ACKNOWLEDGED yet. The cold-start pull in
   getAllNotes is gated on this set: a delete that failed offline or on a 5xx
   stays owed, and no pull runs until it lands — otherwise the pull would
   resurrect rows the user already deleted. localStorage is deliberate: the
   set is tiny, synchronous, and must survive reloads/crashes mid-write. */
const PENDING_DELETES_KEY = 'margin.pendingCloudDeletes';
const pendingDeletes = (): Set<string> => {
    try {
        const v = JSON.parse(localStorage.getItem(PENDING_DELETES_KEY) || '[]');
        return new Set(Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);
    } catch { return new Set(); }
};
const writePendingDeletes = (s: Set<string>) => {
    try { localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify([...s])); } catch { /* quota — best-effort */ }
};
const markPendingDeletes = (ids: Iterable<string>) => {
    const s = pendingDeletes();
    const concrete: string[] = [];
    for (const id of ids) { s.add(id); if (id !== '*') concrete.push(id); }
    writePendingDeletes(s);
    /* a delete supersedes any owed save for the same id — otherwise the
       pending-save flush could re-POST a row the user just deleted. ('*'
       wipes keep owed saves: the wipe re-pushes everything still alive.) */
    if (concrete.length) unmarkPendingSaves(concrete);
};
const unmarkPendingDeletes = (ids: Iterable<string>) => {
    const s = pendingDeletes();
    let changed = false;
    for (const id of ids) if (s.delete(id)) changed = true;
    if (changed) writePendingDeletes(s);
};

/* One cloud delete attempt; a 2xx discharges the marker ('*' discharges the
   whole set — it covers every owed per-id delete). Non-2xx or a network
   error leaves it pending. */
const cloudDelete = async (id: string, headers: Record<string, string>): Promise<void> => {
    const res = await fetch('/api/notes', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ id })
    });
    if (res.ok) {
        if (id === '*') writePendingDeletes(new Set());
        else unmarkPendingDeletes([id]);
    }
};

/* Try to retire everything owed; resolves true only when nothing remains.
   Called before the cold-start pull (ordering barrier) and opportunistically
   on every new delete so a backlog drains on later activity, not just launch. */
const flushPendingDeletes = async (headers: Record<string, string>): Promise<boolean> => {
    const owed = [...pendingDeletes()];
    for (const id of owed) {
        await cloudDelete(id, headers).catch(() => {});
    }
    /* delete→recreate race: a note re-saved while its delete was still owed
       had its POST land BEFORE the delete — the remote row is gone while the
       local copy lives. Re-push anything the store still holds that a
       successful delete covered ('*' covered everything). */
    const still = pendingDeletes();
    const retired = owed.filter(id => !still.has(id));
    if (retired.length) {
        const wipedAll = retired.includes('*');
        const alive = await tx(NOTES_STORE, 'readonly', s => s.getAll() as IDBRequest<Note[]>).catch(() => [] as Note[]);
        for (const n of alive || []) {
            if (isNoteRecord(n) && (wipedAll || retired.includes(n.id))) await syncNoteToCloud(n);
        }
    }
    return pendingDeletes().size === 0;
};

const deleteNoteFromCloud = async (id: string) => {
    markPendingDeletes([id]);
    try {
        const headers = await cloudHeaders();
        if (!headers) return; // stays owed — flushPendingDeletes retires it later
        await flushPendingDeletes(headers); // drains the backlog INCLUDING this id
        await flushPendingSaves(headers);   // …and any saves still owed
    } catch (err) {
        console.error("Cloud sync failed (delete)", err);
    }
};

/* Bulk clear — the '*' sentinel is scoped to the caller's rows server-side. */
const clearAllNotesFromCloud = async () => {
    markPendingDeletes(['*']);
    try {
        const headers = await cloudHeaders();
        if (!headers) return; // '*' stays owed — the pull gate blocks resurrection
        await cloudDelete('*', headers).catch(() => {});
        await flushPendingSaves(headers); // owed saves are moot post-wipe but keep the books clean
    } catch (err) {
        console.error("Cloud sync failed (clear)", err);
    }
};

export const saveNote = async (note: Note): Promise<void> => {
    await tx(NOTES_STORE, 'readwrite', s => s.put(note));
    // Sync to cloud in background
    syncNoteToCloud(note);
};

export const deleteNote = async (id: string): Promise<void> => {
    /* Mark owed BEFORE the local delete commits: a crash between the local
       delete and the mark would leave the cloud row alive with no tombstone
       — a resurrection waiting for the next empty-local pull. Marking first
       errs the safe way: if the local delete then fails, a stray remote
       delete leaves the local copy intact (drift the next save repairs). */
    markPendingDeletes([id]);
    await tx(NOTES_STORE, 'readwrite', s => s.delete(id));
    await deleteNoteVersions(id).catch(() => {});
    mediaCache.delete(id);
    /* When the store is now empty the cloud attempt is awaited — the next
       cold pull could be one refresh away. */
    const remaining = await tx(NOTES_STORE, 'readonly', s => s.getAll());
    if (remaining?.length) deleteNoteFromCloud(id);
    else await deleteNoteFromCloud(id);
};

/* Cloud list responses carry source_data as a mimeType marker with empty
   data — the multi-MB media bytes are fetched on demand, one note at a
   time, so the list pull can't blow the ~4.5MB response cap. On success the
   media is written back into the local copy so it's fetched once per
   device. Returns null when the note has no fetchable media (unsigned, or
   the cloud row never stored it). */
/* The fetched bytes also live in IDB via the cache-back below — but a
   component that remounts before the notes list is reloaded would fetch
   the same multi-MB payload again. Keep the session's hits in memory. */
const mediaCache = new Map<string, { mimeType: string; data: string }>();

export const fetchNoteMedia = async (noteId: string): Promise<{ mimeType: string; data: string } | null> => {
    const cached = mediaCache.get(noteId);
    if (cached) return cached;
    try {
        const headers = await cloudHeaders();
        if (!headers) return null;
        const res = await fetch(`/api/notes?id=${encodeURIComponent(noteId)}`, { headers });
        if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) return null;
        const row = await res.json();
        const media = row?.source_data;
        if (!media || typeof media !== 'object' || typeof media.data !== 'string' || !media.data) return null;
        /* The wire shape can be a bare {data} on a legacy row — resolve a real
           mimeType (the server's, else the local marker's, else octet-stream)
           so the IDB write-back keeps Note.sourceData well-formed. An
           undefined mimeType used to crash the render-time startsWith
           guards — the same "one bad row" class isNoteRecord filters. */
        let local: Note | undefined;
        try { local = await tx(NOTES_STORE, 'readonly', s => s.get(noteId)); } catch { /* best-effort */ }
        const mimeType =
            (typeof media.mimeType === 'string' && media.mimeType) ||
            (typeof local?.sourceData?.mimeType === 'string' && local?.sourceData?.mimeType) ||
            'application/octet-stream';
        const normalized = { mimeType, data: media.data };
        mediaCache.set(noteId, normalized);
        if (local) {
            try {
                await tx(NOTES_STORE, 'readwrite', s => s.put({ ...local, sourceData: normalized }));
            } catch { /* cache-back is best-effort */ }
        }
        return normalized;
    } catch {
        return null;
    }
};

const NOTE_TYPES = new Set(['AUDIO', 'PDF', 'VIDEO', 'TEXT', 'IMAGE']);

/* A record that can't satisfy the Note shape is dropped here rather than
   crashing every consumer downstream (a single bad row used to brick the app). */
const isNoteRecord = (n: any): n is Note =>
    !!n && typeof n.id === 'string' && typeof n.content === 'string' && NOTE_TYPES.has(n.type);

/* The cloud pull is a one-shot cold-start sync — while the local store stays
   empty every refreshNotes()/mount would otherwise re-download /api/notes
   (or the SPA fallback page) for nothing. */
let cloudSyncAttempted = false;

export const getAllNotes = async (): Promise<Note[]> => {
    const rawNotes = await tx(NOTES_STORE, 'readonly', s => s.getAll() as IDBRequest<Note[]>);
    const localNotes = (rawNotes || []).filter(isNoteRecord);

    // If local is empty, try to fetch from cloud (one-time sync)
    if (localNotes.length === 0 && !cloudSyncAttempted) {
        try {
            const headers = await cloudHeaders();
            /* no session — cloud stays off AND the attempt flag stays unset:
               a later refresh (after sign-in lands) still gets its cold pull */
            if (!headers) return localNotes;
            cloudSyncAttempted = true;
            /* Owed deletes are the ordering barrier: a clear/prune/delete that
               didn't reach the server (offline, 5xx) stays pending, and pulling
               now would resurrect exactly those rows. Flush first; if anything
               is still owed, skip the pull — the cloud copy remains intact and
               the deletes retry on the next launch or next delete call. */
            if (!(await flushPendingDeletes(headers))) return localNotes;
            /* Owed saves ride along — a note that failed to POST earlier is
               re-pushed now, so "saved" actually means synced. */
            await flushPendingSaves(headers);
            const res = await fetch('/api/notes', { headers });
            // A static host's SPA fallback answers 200 with index.html — only a
            // real JSON body means the cloud endpoint exists.
            if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
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
    } else {
        /* Local store populated (or the cold pull already ran): still drain
           owed cloud ops on any refresh — saves that failed offline are owed
           until a 2xx lands, and deletes/clears were the only other drain
           triggers. Guarded and fire-and-forget, so an empty ledger costs a
           single localStorage read, nothing more. */
        void flushCloudDebts();
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
    /* Same isNoteRecord filter getAllNotes applies — a malformed row (or a
       non-Note record sharing the store) must not crash the prune on its
       way to the cloud cleanup. */
    const notes = ((await tx(NOTES_STORE, 'readonly', s => s.getAll() as IDBRequest<Note[]>)) || [])
        .filter(isNoteRecord);
    const doomed = notes.filter(n => new Date(n.lastAccessed || 0).getTime() < date.getTime());
    /* Owed BEFORE the local deletes: a crash mid-loop must not leave a
       subset of cloud rows alive with no tombstone. Only THESE ids are
       owed — a '*' wipe would also delete cloud rows this device never had
       (written by another session), outside the prune's intent. */
    if (!doomed.length) return 0;
    markPendingDeletes(doomed.map(n => n.id));
    for (const note of doomed) {
        await tx(NOTES_STORE, 'readwrite', s => s.delete(note.id));
        await deleteNoteVersions(note.id).catch(() => {});
        mediaCache.delete(note.id);
    }
    const headers = await cloudHeaders();
    if (headers) {
        await flushPendingDeletes(headers);
        await flushPendingSaves(headers);
    }
    return doomed.length;
};

export const clearAllNotes = async (): Promise<void> => {
    await tx(NOTES_STORE, 'readwrite', s => s.clear());
    await tx(VERSIONS_STORE, 'readwrite', s => s.clear());
    mediaCache.clear();
    /* Awaited, and owed if it fails: the '*' marker is persisted BEFORE the
       request, so an offline/5xx clear can't be followed by a pull that
       resurrects the wiped library — getAllNotes flushes owed deletes first. */
    await clearAllNotesFromCloud();
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
