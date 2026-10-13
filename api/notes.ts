import { createClient } from '@supabase/supabase-js';
import { readJsonBody } from './_http';
import { requireAuth } from './_usage';

/* Recorded notes carry base64 audio in sourceData — the default 1mb
   bodyParser would 413 them before they ever reached the cloud mirror.
   4.5mb is the Vercel platform request cap, so anything past it is a
   platform 413 regardless; the client strips oversized sourceData itself. */
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '4.5mb',
        },
    },
};

const getSupabase = () => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    if (!url || !key) throw new Error('Missing Supabase credentials');
    return createClient(url, key);
};

/* Notes are owned cloud rows: every call requires a verified Supabase JWT
   (anonymous auth counts) and all queries are scoped to that user's
   user_id. The service-role client bypasses RLS, so the scope here IS the
   boundary — an unsigned caller gets 401, never data. */
export default async function handler(req: any, res: any) {
    try {
        const caller = await requireAuth(req, res);
        if (!caller) return; // 401 sent
        const userId = caller.userId;
        const supabase = getSupabase();

        // GET: Fetch this user's notes
        if (req.method === 'GET') {
            // ?id=<note id> → the full row INCLUDING source_data media — the
            // list response can't carry it (Vercel caps response bodies at
            // ~4.5MB; one recorded note can exceed that alone). Media is
            // fetched lazily per note on the device that needs to play it.
            const one = req.query && typeof req.query.id === 'string' ? req.query.id : null;
            if (one) {
                if (one.length > 200) return res.status(400).json({ error: 'Invalid note id' });
                const { data, error } = await supabase
                    .from('notes')
                    .select('*')
                    .eq('id', one)
                    .eq('user_id', userId)
                    .maybeSingle();
                if (error) throw error;
                if (!data) return res.status(404).json({ error: 'Note not found' });
                return res.status(200).json(data);
            }
            const { data, error } = await supabase
                .from('notes')
                .select('*')
                .eq('user_id', userId)
                .order('last_accessed', { ascending: false });

            if (error) throw error;
            /* Strip media bytes from list rows: source_data.data is multi-MB
               base64 and the whole response shares the ~4.5MB cap — two
               recorded notes would 500 the cold-pull. Keep the mimeType
               marker so clients know media exists; data is lazy-fetched. */
            const rows = (data || []).map((r: any) =>
                r.source_data && typeof r.source_data === 'object' && r.source_data.data
                    ? { ...r, source_data: { mimeType: r.source_data.mimeType ?? null, data: '' } }
                    : r);
            return res.status(200).json(rows);
        }

        // POST: Create or Update a note
        if (req.method === 'POST') {
            const note = readJsonBody(req);

            /* Type-check the mapped fields before Postgres does — an
               object/array where a text column expects a string (or a
               non-array tags/attachments) would surface as a 500 for what
               is really a malformed request. */
            const TEXT_FIELDS = ['title', 'date', 'duration', 'content', 'transcript', 'type', 'lastAccessed'] as const;
            for (const f of TEXT_FIELDS) {
                if (note[f] !== undefined && note[f] !== null && typeof note[f] !== 'string') {
                    return res.status(400).json({ error: `${f} must be a string` });
                }
            }
            if (note.isBookmarked !== undefined && note.isBookmarked !== null && typeof note.isBookmarked !== 'boolean') {
                return res.status(400).json({ error: 'isBookmarked must be a boolean' });
            }
            if (note.tags !== undefined && note.tags !== null && !Array.isArray(note.tags)) {
                return res.status(400).json({ error: 'tags must be an array' });
            }
            if (note.attachments !== undefined && note.attachments !== null && !Array.isArray(note.attachments)) {
                return res.status(400).json({ error: 'attachments must be an array' });
            }
            if (note.sourceData !== undefined && note.sourceData !== null && typeof note.sourceData !== 'object') {
                return res.status(400).json({ error: 'sourceData must be an object' });
            }

            // Map camelCase (frontend) to snake_case (Supabase) with an explicit
            // column allowlist — spreading the whole Note would send client-only
            // fields (pinnedMoments, isProcessing, ...) the table doesn't have,
            // and PostgREST rejects the upsert. user_id is server-stamped;
            // the client can never claim someone else's row.
            const dbNote = {
                id: note.id,
                title: note.title,
                date: note.date,
                duration: note.duration,
                content: note.content,
                transcript: note.transcript,
                type: note.type,
                tags: note.tags,
                attachments: note.attachments,
                is_bookmarked: note.isBookmarked,
                last_accessed: note.lastAccessed,
                source_data: note.sourceData,
                user_id: userId,
                updated_at: new Date().toISOString()
            };

            if (!dbNote.id || typeof dbNote.id !== 'string' || dbNote.id.length > 200) {
                return res.status(400).json({ error: 'Valid note id required (string, 200 chars max)' });
            }

            /* A note synced with a media MARKER (source_data.mimeType but
               empty data — media was too big, or the list response stripped
               it) must not overwrite real stored media with the empty stub:
               keep the existing source_data when one is already on file. */
            if (dbNote.source_data && typeof dbNote.source_data === 'object' && !dbNote.source_data.data) {
                const { data: existing } = await supabase
                    .from('notes')
                    .select('source_data')
                    .eq('id', dbNote.id)
                    .eq('user_id', userId)
                    .maybeSingle();
                if (existing?.source_data && typeof existing.source_data === 'object' && existing.source_data.data) {
                    dbNote.source_data = existing.source_data;
                }
            }

            /* `id` is the table's global primary key — an unconditional
               upsert could overwrite ANOTHER user's row sharing that id, and
               a check-then-write pair races. Write atomically instead:
               update-first scoped to the owner covers the common repeat-save
               in one statement; a 0-row update means the id is free or
               foreign, so try the insert — its PK conflict (23505) is the
               definitive "someone else got here" answer. Rows predating
               user_id (NULL) stay locked until the owner backfills them
               (see supabase_schema.sql). */
            const { data: updated, error: updateError } = await supabase
                .from('notes')
                .update(dbNote)
                .eq('id', dbNote.id)
                .eq('user_id', userId)
                .select();
            if (updateError) throw updateError;
            if (updated && updated.length > 0) {
                return res.status(200).json(updated[0]);
            }

            const { data, error } = await supabase
                .from('notes')
                .insert(dbNote)
                .select()
                .single();
            if (error) {
                if (error.code === '23505') {
                    /* Lost an insert race — the row exists now. Retry the
                       scoped update: it lands when the id is ours (a second
                       save racing the first) and writes 0 rows when it
                       belongs to someone else. */
                    const { data: retry, error: retryError } = await supabase
                        .from('notes')
                        .update(dbNote)
                        .eq('id', dbNote.id)
                        .eq('user_id', userId)
                        .select();
                    if (retryError) throw retryError;
                    if (retry && retry.length > 0) return res.status(200).json(retry[0]);
                    return res.status(403).json({ error: 'Note id belongs to another account' });
                }
                throw error;
            }
            return res.status(200).json(data);
        }

        // DELETE: Remove one of this user's notes — or all of them with the
        // '*' sentinel (clear-library). Either way the user_id scope is the
        // boundary; '*' can only ever wipe the caller's own rows, and client
        // note ids (timestamps / 'intake-…') can never collide with it.
        if (req.method === 'DELETE') {
            const { id } = readJsonBody(req);
            if (id === '*') {
                const { error } = await supabase
                    .from('notes')
                    .delete()
                    .eq('user_id', userId);
                if (error) throw error;
                return res.status(200).json({ success: true });
            }
            if (!id || typeof id !== 'string' || id.length > 200) {
                return res.status(400).json({ error: 'Valid note id required' });
            }
            const { error } = await supabase
                .from('notes')
                .delete()
                .eq('id', id)
                .eq('user_id', userId);

            if (error) throw error;
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error: any) {
        console.error('Notes API Error:', error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}
