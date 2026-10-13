import { createClient } from '@supabase/supabase-js';
import { readJsonBody } from './_http';
import { requireAuth } from './_usage';

/* A long session's `messages` jsonb can pass the default 1mb parser limit —
   give it the platform ceiling so legitimately big histories still sync.
   (Vercel caps request bodies at 4.5MB at the edge anyway.) */
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

/* analysis_sessions.id is a uuid column — an .eq() on a malformed string is
   a Postgres 22P02 (a 500), so validate the shape up front. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: any): v is string => typeof v === 'string' && UUID_RE.test(v);

/* Analysis sessions are owned rows like notes: verified JWT required, every
   query scoped by user_id (the service-role client bypasses RLS, so the scope
   here IS the boundary). */
export default async function handler(req: any, res: any) {
    try {
        const caller = await requireAuth(req, res);
        if (!caller) return; // 401 sent
        const userId = caller.userId;
        const supabase = getSupabase();

        // GET: List this user's sessions
        if (req.method === 'GET') {
            const { data, error } = await supabase
                .from('analysis_sessions')
                .select('id, title, created_at, updated_at')
                .eq('user_id', userId)
                .order('updated_at', { ascending: false });

            if (error) throw error;
            return res.status(200).json(data || []);
        }

        // POST: Create or update a session
        if (req.method === 'POST') {
            const { id, title, messages } = readJsonBody(req);

            /* Type-check before Postgres does — a non-string title or a
               non-array messages jsonb would surface as a 500 for what is
               really a malformed request. messages stays inside the 4.5mb
               parser cap; bound it tighter so a single session can't sit on
               the whole row budget. */
            if (typeof title !== 'string' || title.length > 500 ||
                !Array.isArray(messages) || JSON.stringify(messages).length > 3_500_000) {
                return res.status(400).json({ error: 'title (string ≤500) and messages (array) are required' });
            }

            if (id) {
                if (!isUuid(id)) {
                    return res.status(400).json({ error: 'Invalid session id' });
                }
                // Update existing session — scoped, so a foreign id updates 0
                // rows rather than overwriting someone else's session.
                const { data, error } = await supabase
                    .from('analysis_sessions')
                    .update({ title, messages, updated_at: new Date().toISOString() })
                    .eq('id', id)
                    .eq('user_id', userId)
                    .select();

                if (error) throw error;
                /* A 0-row scoped update is "not yours" OR "doesn't exist" —
                   both answer 404: probing which it is would give callers an
                   existence oracle over other users' session ids. */
                if (!data || data.length === 0) {
                    return res.status(404).json({ error: 'Session not found' });
                }
                return res.status(200).json(data[0]);
            } else {
                // Create new session
                const { data, error } = await supabase
                    .from('analysis_sessions')
                    .insert({ title, messages, user_id: userId })
                    .select()
                    .single();

                if (error) throw error;
                return res.status(201).json(data);
            }
        }

        // PUT: load a specific session with messages (scoped)
        if (req.method === 'PUT') {
            const { id } = readJsonBody(req);
            if (!isUuid(id)) {
                return res.status(400).json({ error: 'Invalid session id' });
            }
            const { data, error } = await supabase
                .from('analysis_sessions')
                .select('*')
                .eq('id', id)
                .eq('user_id', userId)
                .maybeSingle();

            if (error) throw error;
            if (!data) return res.status(404).json({ error: 'Session not found' });
            return res.status(200).json(data);
        }

        // DELETE: Remove one of this user's sessions
        if (req.method === 'DELETE') {
            const { id } = readJsonBody(req);
            if (!isUuid(id)) {
                return res.status(400).json({ error: 'Invalid session id' });
            }
            const { error } = await supabase
                .from('analysis_sessions')
                .delete()
                .eq('id', id)
                .eq('user_id', userId);

            if (error) throw error;
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error: any) {
        console.error('Sessions API Error:', error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}
