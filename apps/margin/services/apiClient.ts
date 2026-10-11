import { getUserId, getAccessToken, setUsageState, triggerUpgrade } from './usageService';

// Thrown when the caller has exhausted their daily free quota.
export class LimitReachedError extends Error {
    isLimit = true;
    constructor() {
        super('Daily free limit reached');
        this.name = 'LimitReachedError';
    }
}

const readUsageHeaders = (res: Response) => {
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
 *  - keeps the client usage store in sync via response headers
 *  - converts a 429 LIMIT_REACHED response into a LimitReachedError and opens
 *    the upgrade modal
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
            if (body.usage) setUsageState(body.usage);
            triggerUpgrade();
            throw new LimitReachedError();
        }
    }

    return res;
};
