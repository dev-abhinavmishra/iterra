import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createTokenPinnedSupabaseClient } from '../../../integration/pinnedSupabaseClient';

// Browser Supabase client (publishable/anon key — safe to expose). Used for
// anonymous auth for usage limits and, after explicit sync consent, the
// owner-scoped canonical record mirror. Missing build-time env vars disable
// Supabase and leave the app on its local fallback paths.
/* vite.config injects `process.env.X` via JSON.stringify(env.X ?? null), but a
   value that still isn't a usable URL/key — the literal "undefined"/"null"
   some toolchains emit, a placeholder, a typo — must degrade to anonymous
   mode, not throw at module eval and take the app down with it. */
const usableUrl = (v: string | undefined | null): string | undefined =>
    v && /^https?:\/\/\S+/i.test(v) ? v : undefined;
const usableKey = (v: string | undefined | null): string | undefined =>
    v && v !== 'undefined' && v !== 'null' ? v : undefined;

const url = usableUrl(process.env.SUPABASE_URL as string | undefined);
const anonKey = usableKey(process.env.SUPABASE_ANON_KEY as string | undefined);

const makeClient = (): SupabaseClient | null => {
    if (!url || !anonKey) return null;
    try {
        return createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
    } catch (e) {
        console.warn('[supabase] misconfigured — anonymous limit path', e);
        return null;
    }
};

export const supabase: SupabaseClient | null = makeClient();

/** A non-persisting data client bound to one captured auth token. */
export function createPinnedSyncClient(accessToken: string): SupabaseClient {
    if (!url || !anonKey) throw new Error('Supabase client configuration is unavailable.');
    return createTokenPinnedSupabaseClient(url, anonKey, accessToken);
}
