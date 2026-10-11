// Usage limiting.
//
// Two layers, picked automatically per request:
//
//  1. AUTHENTICATED (preferred): the client signs in with Supabase anonymous auth
//     and sends its JWT. We verify the JWT server-side, then enforce the limit via
//     the project's `increment_usage` / `get_user_limits` RPCs (the `user_limits`
//     table — monthly windows, plan tiers, durable in Postgres).
//
//  2. ANONYMOUS FALLBACK: no/invalid JWT (e.g. anonymous sign-ins not yet enabled).
//     Falls back to a simple per-browser daily counter in `usage_counters`, or an
//     in-memory map if Supabase is unreachable — so the app never breaks.

import { createClient } from '@supabase/supabase-js';

export const DAILY_LIMIT = parseInt(process.env.DAILY_FREE_LIMIT || '15', 10);

const memory: Record<string, { day: string; count: number }> = {};

const today = () => new Date().toISOString().slice(0, 10);

const getSupabase = () => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY; // service role secret
    if (!url || !key) return null;
    try {
        return createClient(url, key);
    } catch {
        return null;
    }
};

export interface UsageStatus {
    used: number;
    limit: number;
    remaining: number;
    reachedLimit: boolean;
}

// ---------------------------------------------------------------------------
// Caller identity
// ---------------------------------------------------------------------------

/**
 * Resolve who is calling. If a valid Supabase JWT is present we return the
 * authenticated uuid (authed: true); otherwise we fall back to the anonymous
 * x-user-id header / IP.
 */
export const resolveUser = async (req: any): Promise<{ userId: string; authed: boolean }> => {
    const authHeader = req.headers?.['authorization'] || req.headers?.['Authorization'];
    const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : null;

    const sb = getSupabase();
    if (token && sb) {
        try {
            const { data, error } = await sb.auth.getUser(token);
            if (!error && data?.user?.id) {
                return { userId: data.user.id, authed: true };
            }
        } catch {
            /* fall through to anonymous */
        }
    }

    const header = req.headers?.['x-user-id'];
    if (header && typeof header === 'string' && header.length > 0) return { userId: header, authed: false };
    const fwd = (req.headers?.['x-forwarded-for'] || '').toString().split(',')[0].trim();
    return { userId: fwd || 'anonymous', authed: false };
};

/** Backwards-compatible synchronous id resolver (anonymous only). */
export const getUserId = (req: any): string => {
    const header = req.headers?.['x-user-id'];
    if (header && typeof header === 'string' && header.length > 0) return header;
    const fwd = (req.headers?.['x-forwarded-for'] || '').toString().split(',')[0].trim();
    return fwd || 'anonymous';
};

// ---------------------------------------------------------------------------
// Authenticated path (Supabase user_limits RPCs)
// ---------------------------------------------------------------------------

const firstNum = (...vals: any[]): number | undefined => {
    for (const v of vals) {
        const n = typeof v === 'string' ? Number(v) : v;
        if (typeof n === 'number' && !Number.isNaN(n)) return n;
    }
    return undefined;
};

// Normalize whatever column names the project's functions use into UsageStatus.
const mapLimitsRow = (row: any): UsageStatus => {
    const limit = firstNum(row?.request_limit, row?.requests_limit, row?.monthly_request_limit, row?.max_requests, row?.request_quota, row?.monthly_requests);
    let used = firstNum(row?.requests_used, row?.request_count, row?.requests_count, row?.used_requests, row?.requests_made, row?.request_usage);
    let remaining = firstNum(row?.requests_remaining, row?.requests_left, row?.remaining_requests);

    const L = limit ?? 100; // free-tier default per the project schema
    if (remaining === undefined && used !== undefined) remaining = Math.max(0, L - used);
    if (used === undefined && remaining !== undefined) used = Math.max(0, L - remaining);
    if (used === undefined) used = 0;
    if (remaining === undefined) remaining = Math.max(0, L - used);

    return { used, limit: L, remaining, reachedLimit: remaining <= 0 };
};

const authedGetUsage = async (sb: any, userId: string): Promise<UsageStatus | null> => {
    try {
        const { data, error } = await sb.rpc('get_user_limits', { p_user_id: userId });
        if (error) return null;
        const row = Array.isArray(data) ? data[0] : data;
        return mapLimitsRow(row || {});
    } catch {
        return null;
    }
};

const authedConsume = async (sb: any, userId: string, tokens: number): Promise<{ allowed: boolean; status: UsageStatus } | null> => {
    try {
        const { data, error } = await sb.rpc('increment_usage', { p_user_id: userId, p_requests: 1, p_tokens: tokens });
        if (error) return null;
        const row = Array.isArray(data) ? data[0] : data;
        const allowed = row?.allowed !== false;

        // Re-read the full row so the badge has accurate used/limit numbers.
        let status = await authedGetUsage(sb, userId);
        if (!status) {
            const remaining = firstNum(row?.requests_remaining, row?.requests_left) ?? 0;
            status = { used: 0, limit: remaining + (allowed ? 1 : 0), remaining, reachedLimit: !allowed };
        } else if (!allowed) {
            status.reachedLimit = true;
        }
        return { allowed, status };
    } catch {
        return null;
    }
};

// ---------------------------------------------------------------------------
// Anonymous fallback path (daily counter)
// ---------------------------------------------------------------------------

const anonStatus = (used: number): UsageStatus => ({
    used,
    limit: DAILY_LIMIT,
    remaining: Math.max(0, DAILY_LIMIT - used),
    reachedLimit: used >= DAILY_LIMIT,
});

const anonGetUsage = async (userId: string): Promise<UsageStatus> => {
    const day = today();
    const sb = getSupabase();
    if (sb) {
        try {
            const { data } = await sb.from('usage_counters').select('count').eq('user_id', userId).eq('day', day).maybeSingle();
            return anonStatus(data?.count || 0);
        } catch {
            /* fall through */
        }
    }
    const rec = memory[userId];
    return anonStatus(rec && rec.day === day ? rec.count : 0);
};

const anonConsume = async (userId: string): Promise<{ allowed: boolean; status: UsageStatus }> => {
    const day = today();
    const sb = getSupabase();
    if (sb) {
        try {
            /* Atomic conditional consume (supabase_schema.sql ≥ v2): one UPDATE
               that increments only while under the limit — concurrent calls
               can't all slip through. */
            const { data, error } = await sb.rpc('consume_daily_usage', { p_user_id: userId, p_day: day, p_limit: DAILY_LIMIT });
            if (!error && typeof data === 'number') {
                return data < 0
                    ? { allowed: false, status: anonStatus(-data) }
                    : { allowed: true, status: anonStatus(data) };
            }
            /* Legacy schema (function not installed): non-atomic read+upsert.
               Run the updated supabase_schema.sql to close the race. */
            const { data: row } = await sb.from('usage_counters').select('count').eq('user_id', userId).eq('day', day).maybeSingle();
            const used = row?.count || 0;
            if (used >= DAILY_LIMIT) return { allowed: false, status: anonStatus(used) };
            await sb.from('usage_counters').upsert({ user_id: userId, day, count: used + 1 }, { onConflict: 'user_id,day' });
            return { allowed: true, status: anonStatus(used + 1) };
        } catch {
            /* fall through */
        }
    }
    const rec = memory[userId] && memory[userId].day === day ? memory[userId] : { day, count: 0 };
    if (rec.count >= DAILY_LIMIT) {
        memory[userId] = rec;
        return { allowed: false, status: anonStatus(rec.count) };
    }
    rec.count += 1;
    memory[userId] = rec;
    return { allowed: true, status: anonStatus(rec.count) };
};

/** Give back one reserved use (a failed AI call must not cost quota). */
const anonRefund = async (userId: string): Promise<UsageStatus> => {
    const day = today();
    const sb = getSupabase();
    if (sb) {
        try {
            const { data, error } = await sb.rpc('refund_daily_usage', { p_user_id: userId, p_day: day });
            if (!error && typeof data === 'number') return anonStatus(data);
        } catch {
            /* fall through */
        }
    }
    const rec = memory[userId] && memory[userId].day === day ? memory[userId] : { day, count: 0 };
    rec.count = Math.max(0, rec.count - 1);
    memory[userId] = rec;
    return anonStatus(rec.count);
};

const authedRefund = async (sb: any, userId: string): Promise<UsageStatus | null> => {
    try {
        /* decrement_usage must exist in the project DB alongside
           increment_usage (see supabase_schema.sql note). */
        await sb.rpc('decrement_usage', { p_user_id: userId, p_requests: 1, p_tokens: 0 });
        return await authedGetUsage(sb, userId);
    } catch {
        return null;
    }
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const estimateTokens = (body: any): number => {
    try {
        return Math.min(20000, Math.ceil(JSON.stringify(body || '').length / 4) + 200);
    } catch {
        return 500;
    }
};

/** Read current usage without consuming quota. */
export const getUsageFor = async (userId: string, authed: boolean): Promise<UsageStatus> => {
    const sb = getSupabase();
    if (authed && sb) {
        const s = await authedGetUsage(sb, userId);
        if (s) return s;
    }
    return anonGetUsage(userId);
};

const sendUsageHeaders = (res: any, status: UsageStatus) => {
    res.setHeader('x-usage-used', String(status.used));
    res.setHeader('x-usage-limit', String(status.limit));
    res.setHeader('x-usage-remaining', String(status.remaining));
};

export interface UsageTicket {
    userId: string;
    authed: boolean;
    /** Return the reserved use after a failed AI call. Refunds the same
        ledger that was charged — never the other bucket. */
    refund: () => Promise<void>;
}

/**
 * Admission gate: ATOMICALLY reserves one use (check + consume in the same
 * step) so concurrent callers can't all squeeze past the limit. Replies 429
 * and returns null when over quota. A successful AI call needs nothing more;
 * a failed one returns the use via ticket.refund().
 */
export const reserveLimit = async (req: any, res: any): Promise<UsageTicket | null> => {
    const { userId, authed } = await resolveUser(req);
    const sb = getSupabase();

    let via: 'authed' | 'anon' = 'anon';
    let result: { allowed: boolean; status: UsageStatus } | null = null;
    if (authed && sb) {
        result = await authedConsume(sb, userId, estimateTokens(req.body));
        if (result) via = 'authed';
    }
    if (!result) {
        result = await anonConsume(userId); // fallback / unauthenticated
    }
    sendUsageHeaders(res, result.status);
    if (!result.allowed) {
        res.status(429).json({ error: 'LIMIT_REACHED', usage: result.status });
        return null;
    }

    return {
        userId,
        authed,
        refund: async () => {
            try {
                // Refund only the ledger that was charged.
                const status = via === 'authed'
                    ? (sb ? await authedRefund(sb, userId) : null)
                    : await anonRefund(userId);
                if (status) sendUsageHeaders(res, status);
            } catch {
                /* refund failures must not fail the request */
            }
        },
    };
};
