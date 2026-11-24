// Generic per-user document sync for Margin's non-note data — decks,
// quizzes, settings and per-note version snapshots ('ver:<noteId>').
// One JSON payload per (user_id, doc_key); the client owns merge
// semantics, this route is a dumb scoped store.
//
// Same trust model as /api/notes: requireAuth (verified Supabase JWT,
// anonymous counts), service-role client, user_id stamped server-side —
// a caller can only ever read/write their own rows.
import { createClient } from '@supabase/supabase-js';
import { readJsonBody } from './_http';
import { requireAuth } from './_usage';

export const config = {
    api: {
        bodyParser: {
            /* Same platform ceiling reasoning as notes.ts — the parser only
               needs headroom under Vercel's 4.5MB edge cap. */
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

/* Doc keys are client-chosen but bounded: 'settings', 'decks', 'quizzes',
   'ver:<noteId>'. The charset blocks anything that could smuggle path or
   query syntax; 120 chars is far past the longest legitimate key. */
const KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,119}$/;
const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024;

export default async function handler(req: any, res: any) {
    try {
        const caller = await requireAuth(req, res);
        if (!caller) return; // 401 sent
        const userId = caller.userId;
        const supabase = getSupabase();

        // GET: every doc this user owns, keyed for the client.
        if (req.method === 'GET') {
            const { data, error } = await supabase
                .from('margin_docs')
                .select('doc_key, payload, updated_at')
                .eq('user_id', userId);
            if (error) throw error;
            const docs: Record<string, { payload: any; updated_at: string }> = {};
            for (const row of data || []) {
                docs[row.doc_key] = { payload: row.payload, updated_at: row.updated_at };
            }
            return res.status(200).json({ docs });
        }

        if (req.method === 'PUT') {
            const body = readJsonBody(req);
            const key = typeof body?.key === 'string' ? body.key : '';
            if (!KEY_RE.test(key)) {
                return res.status(400).json({ error: 'Invalid doc key' });
            }
            if (body?.payload === undefined) {
                return res.status(400).json({ error: 'payload is required' });
            }
            /* jsonb round-trips JSON only — reject values that would silently
               mutate (undefined/functions drop out, NaN becomes null) so the
               client knows the write didn't land as sent. */
            let payloadJson: string | undefined;
            try {
                payloadJson = JSON.stringify(body.payload);
            } catch {
                return res.status(400).json({ error: 'payload is not JSON-serializable' });
            }
            /* JSON.stringify yields undefined for undefined/functions/
               symbols — those can't round-trip through jsonb. */
            if (typeof payloadJson !== 'string') {
                return res.status(400).json({ error: 'payload is not JSON-serializable' });
            }
            if (new Blob([payloadJson]).size > MAX_PAYLOAD_BYTES) {
                return res.status(413).json({ error: 'Doc too large to sync' });
            }

            const updated_at = new Date().toISOString();
            const { error } = await supabase
                .from('margin_docs')
                .upsert(
                    { user_id: userId, doc_key: key, payload: body.payload, updated_at },
                    { onConflict: 'user_id,doc_key' }
                );
            if (error) throw error;
            return res.status(200).json({ updated_at });
        }

        if (req.method === 'DELETE') {
            const { key } = readJsonBody(req);
            if (typeof key !== 'string' || !KEY_RE.test(key)) {
                return res.status(400).json({ error: 'Invalid doc key' });
            }
            const { error } = await supabase
                .from('margin_docs')
                .delete()
                .eq('user_id', userId)
                .eq('doc_key', key);
            if (error) throw error;
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err: any) {
        console.error('[margin-docs]', err?.message || err);
        return res.status(500).json({ error: 'Document sync failed' });
    }
}
