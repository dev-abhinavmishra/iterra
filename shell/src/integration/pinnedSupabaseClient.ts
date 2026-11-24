import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Force every request from this client to use the session token that was
    verified when the sync adapter attached. This prevents a shared auth
    client's account switch between a local guard and fetch dispatch from
    redirecting the operation to the new uid. */
export function createTokenPinnedFetch(
  accessToken: string,
  fetcher: typeof fetch = globalThis.fetch,
): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );
    new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
    headers.set('Authorization', `Bearer ${accessToken}`);
    return fetcher(input, { ...init, headers });
  };
}

export function createTokenPinnedSupabaseClient(
  url: string,
  publishableKey: string,
  accessToken: string,
  fetcher?: typeof fetch,
): SupabaseClient {
  return createClient(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: createTokenPinnedFetch(accessToken, fetcher) },
  });
}
