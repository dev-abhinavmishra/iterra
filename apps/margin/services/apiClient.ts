import { getUserId, getAccessToken, setUsageState, triggerUpgrade } from './usageService';

// Thrown when the caller has exhausted their daily free quota.
export class LimitReachedError extends Error {
    isLimit = true;
    constructor() {
        super('Daily free limit reached');
        this.name = 'LimitReachedError';
    }
}

/* Named daily buckets carry their own caps server-side (transcribe/title —
   see api/_usage.ts). A bucket 429 is an endpoint-scoped failure: it must
   NOT zero the main badge or open the upgrade modal, so it gets its own
   error type carrying a user-facing message. */
const BUCKET_MESSAGES: Record<string, string> = {
    transcribe: "Today's transcription limit is reached — it resets tomorrow.",
    title: 'Title suggestions are done for today — they reset tomorrow.',
};

export class BucketLimitError extends Error {
    isLimit = true;
    bucket: string;
    constructor(bucket: string) {
        super(BUCKET_MESSAGES[bucket] || `Today's ${bucket} limit is reached — it resets tomorrow.`);
        this.name = 'BucketLimitError';
        this.bucket = bucket;
    }
}

const readUsageHeaders = (res: Response) => {
    /* 'main' is the shared AI pool the badge shows. Bucketed responses report
       THEIR bucket's counter (transcribe=30/day, title=60/day) — feeding
       those numbers into the global state would flash the wrong limit (e.g.
       29/30 after one recording) until the next main-quota call. */
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
 *  - attaches the anonymous x-user-id header used for daily limiting
 *  - keeps the client usage store in sync via response headers (main pool only)
 *  - converts a 429 LIMIT_REACHED on the main pool into a LimitReachedError
 *    and opens the upgrade modal; a NAMED-bucket 429 throws BucketLimitError
 *    instead — the global notice would be a lie, the main pool may be full
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

    if (res.status === 429) {
        let body: any = null;
        try {
            body = await res.clone().json();
        } catch {
            /* ignore */
        }
        if (body?.error === 'LIMIT_REACHED') {
            const bucket = typeof body.bucket === 'string' && body.bucket !== 'main' ? body.bucket : null;
            if (bucket) throw new BucketLimitError(bucket);
            if (body.usage) setUsageState(body.usage);
            triggerUpgrade();
            throw new LimitReachedError();
        }
    }

    return res;
};
