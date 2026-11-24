import { getUserId, getAccessToken, setUsageState } from './usageService';

// Legacy error types kept for backwards compatibility — free-usage quotas
// were removed, so the server never emits LIMIT_REACHED anymore and these
// are never thrown. Callers that still `instanceof`-check them simply never
// match; real HTTP errors surface through the normal !res.ok paths.
export class LimitReachedError extends Error {
    isLimit = true;
    constructor() {
        super('Daily free limit reached');
        this.name = 'LimitReachedError';
    }
}

export class BucketLimitError extends Error {
    isLimit = true;
    bucket: string;
    constructor(bucket: string) {
        super(`Today's ${bucket} limit is reached — it resets tomorrow.`);
        this.name = 'BucketLimitError';
        this.bucket = bucket;
    }
}

const readUsageHeaders = (res: Response) => {
    /* 'main' is the shared AI pool the badge shows. Bucketed responses report
       THEIR bucket's counter — feeding those numbers into the global state
       would flash the wrong limit until the next main-quota call. */
    const bucket = res.headers.get('x-usage-bucket');
    if (bucket && bucket !== 'main') return;
    const used = res.headers.get('x-usage-used');
    const limit = res.headers.get('x-usage-limit');
    const remaining = res.headers.get('x-usage-remaining');
    if (used !== null && limit !== null && remaining !== null) {
        const u = parseInt(used, 10);
        const l = parseInt(limit, 10);
        const r = parseInt(remaining, 10);
        setUsageState({ used: u, limit: l, remaining: r, reachedLimit: r <= 0 });
    }
};

/**
 * fetch wrapper that:
 *  - attaches the anonymous x-user-id header (kept for server-side metrics;
 *    quotas are disabled server-side unless USAGE_LIMITS_ENABLED=1)
 *  - keeps the client usage store in sync via response headers (main pool only)
 *  - attaches the Supabase JWT when signed in
 *
 * 429 responses are returned to the caller like any other error — nothing is
 * converted into a limit error or routed to the upgrade modal.
 */
export const apiFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(options.headers || {});
    headers.set('x-user-id', getUserId());
    // Attach the Supabase JWT when signed in, so the backend can use the
    // authenticated user_limits RPCs. Falls back to x-user-id otherwise.
    const token = await getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const res = await fetch(url, { ...options, headers });

    readUsageHeaders(res);

    return res;
};
