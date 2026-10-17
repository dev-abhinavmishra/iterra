// Usage limiting.
//
// Every AI endpoint passes through reserveLimit(), which ATOMICALLY reserves
// one use and returns a refund ticket — a failed provider call hands the use
// back so users aren't charged for work they never got.
//
// Identity layers, picked automatically per request:
//
//  1. AUTHENTICATED (preferred): the client signs in with Supabase auth and
//     sends its JWT. Verified server-side; main quota lives in the monthly
//     `user_limits` ledger via the project's increment_usage / get_user_limits
//     RPCs.
//
//     Anonymous-auth JWTs (is_anonymous) use the same monthly uid ledger —
//     but are ALSO pinned by client IP ('ip:<bucket>:<ip>' daily counter),
//     because a throwaway anon account is one signInAnonymously() away and
//     can't be the abuse boundary: the machine behind it is.
//
//  2. UNSIGNED FALLBACK: no/invalid JWT (e.g. anonymous sign-ins disabled).
//     A daily usage_counters row keyed on the caller's x-user-id — trivially
//     rotatable, so the same IP pin bounds the machine doing the rotating.
//
// Buckets: named endpoints (transcribe, title) keep their own daily quota so
// recordings and title-generation can't drain the main AI pool — counter ids
// are '<bucket>:<id>' for the uid side and 'ip:<bucket>:<ip>' for the pin
// (the main bucket is 'ai').
//
// Storage tiers, tried in order:
//   Postgres RPCs (consume_daily_usage / refund_daily_usage / increment_usage
//     / decrement_usage) — atomic conditional consume; preferred.
//   Table read+upsert on usage_counters — same limits, not atomic (legacy
//     schema fallback; run the updated supabase_schema.sql to close the race).
//   In-memory Map — dev / single-process only; same contract.

import { createClient } from '@supabase/supabase-js';

/** Parse a positive integer env var; anything missing/invalid/non-positive
    falls back so a malformed env can't NaN the limit away. */
export const envInt = (name: string, fallback: number): number => {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

export const DAILY_LIMIT = envInt('DAILY_FREE_LIMIT', 15);

/* The IP pin's pool is bigger than a single id's: one machine may legitimately
   mint several anon ids (reinstalls, cleared storage), so it's bounded at
   limit × multiplier rather than the id limit. */
const ANON_IP_LIMIT_MULT = envInt('ANON_IP_LIMIT_MULT', 10);

/* In-memory fallback ledger (dev / single-process). Bounded so an x-user-id
   rotation flood can't grow it without limit. */
const MEM_MAX_KEYS = 20000;
const memory = new Map<string, { day: string; count: number }>();

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
 * The caller's IP as observed by the platform — the only honest signal an
 * unsigned caller can't rotate. On Vercel the edge owns x-forwarded-for (the
 * platform appends the real client hop last); elsewhere the socket peer is
 * all we have. Client-claimed proxy headers are never trusted off-platform.
 */
export const resolveNetIp = (req: any): string => {
    if (process.env.VERCEL) {
        const xff = (req.headers?.['x-vercel-forwarded-for'] || req.headers?.['x-forwarded-for'] || '')
            .toString().split(',');
        const last = xff[xff.length - 1]?.trim();
        if (last) return last;
    }
    return req.socket?.remoteAddress || 'unknown';
};

const bearerToken = (req: any): string | null => {
    const authHeader = req.headers?.['authorization'] || req.headers?.['Authorization'];
    return typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : null;
};

/**
 * Resolve who is calling. A valid Supabase JWT returns the authenticated uuid
 * (authed: true, with isAnon marking anonymous-auth accounts); otherwise the
 * caller is unsigned — the x-user-id header if present, else the net IP.
 */
export const resolveUser = async (req: any): Promise<{ userId: string; authed: boolean; isAnon: boolean; ip: string }> => {
    const ip = resolveNetIp(req);
    const token = bearerToken(req);
    const sb = getSupabase();
    if (token && sb) {
        try {
            const { data, error } = await sb.auth.getUser(token);
            if (!error && data?.user?.id) {
                return { userId: data.user.id, authed: true, isAnon: data.user.is_anonymous === true, ip };
            }
        } catch {
            /* fall through to unsigned */
        }
    }

    const header = req.headers?.['x-user-id'];
    return { userId: (typeof header === 'string' && header) || ip, authed: false, isAnon: false, ip };
};

/** Backwards-compatible synchronous id resolver (unsigned id only). */
export const getUserId = (req: any): string => {
    const header = req.headers?.['x-user-id'];
    if (header && typeof header === 'string' && header.length > 0) return header;
    return resolveNetIp(req);
};

/**
 * Gate for routes that persist user-owned rows: a verified Supabase JWT is
 * REQUIRED — the forgeable x-user-id header is never enough. Sends 401 and
 * returns null when there's no valid token; anonymous-auth JWTs count.
 */
export const requireAuth = async (req: any, res: any): Promise<{ userId: string; isAnon: boolean } | null> => {
    const token = bearerToken(req);
    const sb = getSupabase();
    if (token && sb) {
        try {
            const { data, error } = await sb.auth.getUser(token);
            if (!error && data?.user?.id) {
                return { userId: data.user.id, isAnon: data.user.is_anonymous === true };
            }
        } catch {
            /* fall through to 401 */
        }
    }
    res.status(401).json({ error: 'Authentication required' });
    return null;
};

// ---------------------------------------------------------------------------
// Counter-key scheme (mirrors supabase_schema.sql)
// ---------------------------------------------------------------------------

/* Main-bucket pin name — 'ip:ai:<ip>' for unbucketed calls. */
const MAIN_BUCKET = 'ai';

const uidKey = (bucket: string | undefined, uid: string) => (bucket ? `${bucket}:${uid}` : uid);
const pinKey = (bucket: string | undefined, ip: string) => `ip:${bucket || MAIN_BUCKET}:${ip}`;

const counterStatus = (used: number, limit: number): UsageStatus => ({
    used,
    limit,
    remaining: Math.max(0, limit - used),
    reachedLimit: used >= limit,
});

// ---------------------------------------------------------------------------
// In-memory tier
// ---------------------------------------------------------------------------

/* Evict stale-day rows first, then oldest-touched. Map order is insertion
   order — a plain set() does NOT move a key, so the IP pin (written once,
   then read-only under a uid-rotation flood) would sit at the oldest slot
   and evict FIRST. memSet re-inserts touched keys to the recency end so the
   pin survives the flood it exists to stop. */
const memCompact = (day: string): void => {
    for (const [k, v] of memory) {
        if (memory.size <= MEM_MAX_KEYS) break;
        if (v.day !== day) memory.delete(k);
    }
    for (const [k] of memory) {
        if (memory.size <= MEM_MAX_KEYS) break;
        memory.delete(k);
    }
};

const memSet = (key: string, rec: { day: string; count: number }): void => {
    memory.delete(key);
    memory.set(key, rec);
};

const memGet = (key: string, day: string): { day: string; count: number } => {
    if (memory.size > MEM_MAX_KEYS) memCompact(day);
    const rec = memory.get(key);
    return rec && rec.day === day ? rec : { day, count: 0 };
};

// ---------------------------------------------------------------------------
// Daily-counter ledger (unsigned ids, buckets, IP pins)
// ---------------------------------------------------------------------------

/** Read a daily counter without consuming. */
const dailyRead = async (key: string, day: string): Promise<number> => {
    const sb = getSupabase();
    if (sb) {
        try {
            const { data } = await sb.from('usage_counters').select('count').eq('user_id', key).eq('day', day).maybeSingle();
            return data?.count || 0;
        } catch {
            /* fall through to memory */
        }
    }
    return memGet(key, day).count;
};

/**
 * Atomically consume one unit of a daily counter. Returns the post-consume
 * count and whether the consume landed under the limit.
 */
const dailyConsume = async (key: string, day: string, limit: number): Promise<{ allowed: boolean; count: number }> => {
    const sb = getSupabase();
    if (sb) {
        try {
            /* Atomic conditional consume (supabase_schema.sql ≥ v2): one UPDATE
               that increments only while under the limit — concurrent calls
               can't all slip through. A negative return is -(count) at a deny. */
            const { data, error } = await sb.rpc('consume_daily_usage', { p_user_id: key, p_day: day, p_limit: limit });
            if (!error && typeof data === 'number') {
                return data < 0 ? { allowed: false, count: -data } : { allowed: true, count: data };
            }
            /* Legacy schema (function not installed): non-atomic read+upsert.
               Run the updated supabase_schema.sql to close the race. */
            const { data: row } = await sb.from('usage_counters').select('count').eq('user_id', key).eq('day', day).maybeSingle();
            const used = row?.count || 0;
            if (used >= limit) return { allowed: false, count: used };
            await sb.from('usage_counters').upsert({ user_id: key, day, count: used + 1 }, { onConflict: 'user_id,day' });
            return { allowed: true, count: used + 1 };
        } catch {
            /* fall through to memory */
        }
    }
    const rec = memGet(key, day);
    if (rec.count >= limit) {
        memSet(key, rec);
        return { allowed: false, count: rec.count };
    }
    rec.count += 1;
    memSet(key, rec);
    return { allowed: true, count: rec.count };
};

/** Give back one reserved unit (a failed AI call must not cost quota). */
const dailyRefund = async (key: string, day: string): Promise<void> => {
    const sb = getSupabase();
    if (sb) {
        try {
            const { error } = await sb.rpc('refund_daily_usage', { p_user_id: key, p_day: day });
            if (!error) return;
        } catch {
            /* fall through to memory */
        }
    }
    const rec = memGet(key, day);
    rec.count = Math.max(0, rec.count - 1);
    memSet(key, rec);
};

// ---------------------------------------------------------------------------
// Authenticated monthly ledger (Supabase user_limits RPCs)
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

const authedRefund = async (sb: any, userId: string): Promise<void> => {
    try {
        /* decrement_usage must exist in the project DB alongside
           increment_usage (see supabase_schema.sql note). */
        await sb.rpc('decrement_usage', { p_user_id: userId, p_requests: 1, p_tokens: 0 });
    } catch {
        /* refund is best-effort; a miss over-charges by one */
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

const sendUsageHeaders = (res: any, status: UsageStatus) => {
    res.setHeader('x-usage-used', String(status.used));
    res.setHeader('x-usage-limit', String(status.limit));
    res.setHeader('x-usage-remaining', String(status.remaining));
};

export interface UsageTicket {
    userId: string;
    authed: boolean;
    /** Return every reserved use after a failed AI call — refunds each ledger
        that was charged (monthly uid AND the IP pin), never the wrong one. */
    refund: () => Promise<void>;
}

/**
 * Read current usage without consuming quota. When the caller is IP-pinned
 * (unsigned, or anonymous-auth with an ip), the BINDING pool is reported —
 * the pin's pool when it's the tighter of the two — so the usage badge shows
 * what's actually left rather than an id bucket the pin would veto anyway.
 */
export const getUsageFor = async (
    userId: string,
    authed: boolean,
    opts: { ip?: string; isAnon?: boolean; bucket?: string; limit?: number; ipLimit?: number } = {},
): Promise<UsageStatus> => {
    const bucket = typeof opts.bucket === 'string' && opts.bucket ? opts.bucket : undefined;
    const limit = opts.limit && opts.limit > 0 ? Math.floor(opts.limit) : DAILY_LIMIT;
    const ipLimit = opts.ipLimit && opts.ipLimit > 0 ? Math.floor(opts.ipLimit) : limit * ANON_IP_LIMIT_MULT;
    const day = today();
    const sb = getSupabase();

    /* The uid-side pool: monthly ledger for authed main-quota callers, the
       daily counter otherwise. */
    let status: UsageStatus | null = null;
    if (authed && sb && !bucket) {
        status = await authedGetUsage(sb, userId);
    }
    if (!status) {
        status = counterStatus(await dailyRead(uidKey(bucket, userId), day), limit);
    }

    /* The pin's pool: tighter = fewer calls until a deny. */
    if (opts.ip && (opts.isAnon || !authed)) {
        const pin = counterStatus(await dailyRead(pinKey(bucket, opts.ip), day), ipLimit);
        if (pin.remaining < status.remaining) return pin;
    }
    return status;
};

/**
 * Admission gate: ATOMICALLY reserves one use in every ledger the caller is
 * bound by — the IP pin FIRST (it's the abuse wall: a denied pin never lets
 * a fresh uid ledger get charged), then the uid ledger (monthly user_limits
 * for authed main-quota calls, the daily counter everywhere else). Replies
 * 429 — reporting the pool that actually denied — and returns null when any
 * ledger is full; earlier reservations are handed back. A successful AI call
 * needs nothing more; a failed one returns the use via ticket.refund().
 */
export const reserveLimit = async (
    req: any,
    res: any,
    opts: { bucket?: string; limit?: number; ipLimit?: number } = {},
): Promise<UsageTicket | null> => {
    const bucket = typeof opts.bucket === 'string' && opts.bucket ? opts.bucket : undefined;
    const limit = opts.limit && opts.limit > 0 ? Math.floor(opts.limit) : DAILY_LIMIT;
    const ipLimit = opts.ipLimit && opts.ipLimit > 0 ? Math.floor(opts.ipLimit) : limit * ANON_IP_LIMIT_MULT;
    res.setHeader('x-usage-bucket', bucket || 'main');

    const { userId, authed, isAnon, ip } = await resolveUser(req);
    const sb = getSupabase();
    const day = today();

    /* Only unsigned callers and anonymous-auth accounts get the IP pin — a
       verified non-anon account can't mint fresh uids, so pinning it by
       network would just punish users on shared IPs. */
    const pinned = !authed || isAnon;

    const charged: Array<{ kind: 'daily'; key: string } | { kind: 'monthly'; uid: string }> = [];
    const statuses: UsageStatus[] = [];
    const deny = async (status: UsageStatus): Promise<null> => {
        for (const c of charged) {
            if (c.kind === 'daily') await dailyRefund(c.key, day);
            else if (sb) await authedRefund(sb, c.uid);
        }
        sendUsageHeaders(res, status);
        res.status(429).json({ error: 'LIMIT_REACHED', usage: status, bucket: bucket || 'main' });
        return null;
    };

    // 1. The IP pin.
    if (pinned) {
        const key = pinKey(bucket, ip);
        const r = await dailyConsume(key, day, ipLimit);
        if (!r.allowed) return deny(counterStatus(r.count, ipLimit));
        charged.push({ kind: 'daily', key });
        statuses.push(counterStatus(r.count, ipLimit));
    }

    // 2. The uid ledger — monthly RPC for the authed main quota, daily
    //    counter for unsigned callers and every named bucket.
    let monthlyCharged = false;
    if (authed && sb && !bucket) {
        const r = await authedConsume(sb, userId, estimateTokens(req.body));
        if (r) {
            if (!r.allowed) return deny(r.status);
            charged.push({ kind: 'monthly', uid: userId });
            statuses.push(r.status);
            monthlyCharged = true;
        }
        /* null → the project RPCs aren't deployed; degrade to the daily
           counter rather than 500 the request. */
    }
    if (!monthlyCharged) {
        const key = uidKey(bucket, userId);
        const r = await dailyConsume(key, day, limit);
        if (!r.allowed) return deny(counterStatus(r.count, limit));
        charged.push({ kind: 'daily', key });
        statuses.push(counterStatus(r.count, limit));
    }

    sendUsageHeaders(res, statuses.reduce((a, b) => (b.remaining < a.remaining ? b : a)));

    return {
        userId,
        authed,
        refund: async () => {
            try {
                for (const c of charged) {
                    if (c.kind === 'daily') await dailyRefund(c.key, day);
                    else if (sb) await authedRefund(sb, c.uid);
                }
            } catch {
                /* refund failures must not fail the request */
            }
        },
    };
};
