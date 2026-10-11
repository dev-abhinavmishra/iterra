import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Browser Supabase client (publishable/anon key — safe to expose). Used only for
// anonymous auth so each browser gets a real auth.users uuid that the backend's
// usage RPCs key on. If the env vars aren't provided at build time, this is null
// and the app falls back to the anonymous daily-limit path.
const url = process.env.SUPABASE_URL as string | undefined;
const anonKey = process.env.SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null = (url && anonKey)
    ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } })
    : null;
