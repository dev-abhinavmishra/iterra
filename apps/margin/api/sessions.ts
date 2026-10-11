import { createClient } from '@supabase/supabase-js';
import { readJsonBody } from './_http';

const getSupabase = () => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    if (!url || !key) throw new Error('Missing Supabase credentials');
    return createClient(url, key);
};

export default async function handler(req: any, res: any) {
    try {
        const supabase = getSupabase();

        // GET: List all sessions
        if (req.method === 'GET') {
            const { data, error } = await supabase
                .from('analysis_sessions')
                .select('id, title, created_at, updated_at')
                .order('updated_at', { ascending: false });
            
            if (error) throw error;
            return res.status(200).json(data || []);
        }

        // POST: Create or update a session
        if (req.method === 'POST') {
            const { id, title, messages } = readJsonBody(req);

            if (id) {
                // Update existing session
                const { data, error } = await supabase
                    .from('analysis_sessions')
                    .update({ title, messages, updated_at: new Date().toISOString() })
                    .eq('id', id)
                    .select()
                    .single();
                
                if (error) throw error;
                return res.status(200).json(data);
            } else {
                // Create new session
                const { data, error } = await supabase
                    .from('analysis_sessions')
                    .insert({ title, messages })
                    .select()
                    .single();
                
                if (error) throw error;
                return res.status(201).json(data);
            }
        }

        // GET with ID (load specific session with messages)
        if (req.method === 'PUT') {
            const { id } = readJsonBody(req);
            const { data, error } = await supabase
                .from('analysis_sessions')
                .select('*')
                .eq('id', id)
                .single();
            
            if (error) throw error;
            return res.status(200).json(data);
        }

        // DELETE: Remove a session
        if (req.method === 'DELETE') {
            const { id } = readJsonBody(req);
            const { error } = await supabase
                .from('analysis_sessions')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error: any) {
        console.error('Sessions API Error:', error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}
