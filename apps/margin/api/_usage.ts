// Usage limiting.
//
// Two layers, picked automatically per request:
//
//  1. AUTHENTICATED (preferred): the client signs in with Supabase anonymous auth
//     and sends its JWT. We verify the JWT server-side, then enforce the limit via
//     the project's `increment_usage` / `get_user_limits` RPCs (the `user_limits`
//     table — monthly windows, plan tiers, durable in Postgres).
//     Anonymous-auth JWTs (`user.is_anonymous`) are additionally charged against
//     the daily IP pin: the uid is verified but freely re-mintable, so without
//     the pin scripted account rotation could outrun the monthly cap.
//
//  2. ANONYMOUS FALLBACK: no/invalid JWT (e.g. anonymous sign-ins not yet enabled).
//     Falls back to a per-browser daily counter in `usage_counters`, or an
//     in-memory map if Supabase is unreachable — so the app never breaks.
//     Anonymous identity is DOUBLE-keyed: the browser's x-user-id AND the
//     platform-observed client IP each get a counter, so rotating x-user-id
//     alone can't mint a fresh bucket — the IP counter still pins the caller.
//
//  Endpoints may also carry a named `bucket` (e.g. 'transcribe', 'title') with
//  its own daily cap — bucketed calls never consume the main AI quota.

import { createClient } from '@supabase/supabase-js';

/* A malformed env var must not silently open the quota: parseInt gives NaN
   and every `used >= limit` comparison downstream goes false. Fall back to
   the default for anything that isn't a positive integer. */
export const envInt = (name: string, fallback: number): number => {
    const n = parseInt(process.env[name] || '', 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const DAILY_LIMIT = envInt('DAILY_FREE_LIMIT', 15);

/* The anonymous IP pin is a multiple of the per-user cap: one IP can serve
   several distinct browsers (NAT, school networks) while still bounding total
   spend. Tune with ANON_IP_LIMIT_MULT. */
const ANON_IP_MULT = envInt('ANON_IP_LIMIT_MULT', 10);

const memory: Record<string, { day: string; count: number }> = {};

/* The in-memory ledger only runs when Supabase is absent — but that is
   precisely the deployment where nothing else bounds a rotating x-user-id:
   each fresh header would mint a new map key forever. Cap the map: stale-day
   entries are compacted first, then least-recently-touched (string keys
   iterate in INSERTION order, and re-assignment alone doesn't reorder —
   every counter write must go through memSet so a live key keeps its
   recency. The counter that matters under rotation — the IP pin — is
   re-touched on every request, so it rides out a flood of fresh id keys;
   the flood itself is what gets evicted. */
const MEM_MAX_KEYS = 20000;
const memCompact = (day: string) => {
    const keys = Object.keys(memory);
    if (keys.length < MEM_MAX_KEYS) return;
    for (const k of keys) if (memory[k].day !== day) delete memory[k];
    const rest = Object.keys(memory);
    const excess = rest.length - MEM_MAX_KEYS + 1;
    for (let i = 0; i < excess; i++) delete memory[rest[i]];
};
/* Write a counter record AND re-pin its recency: `delete` + re-insert moves
   the key to the end of the iteration order — a plain `memory[key] = rec`
   would leave it at its original insertion position, making a hot key
   (the shared IP pin) the oldest entry and the first evicted under flood. */
const memSet = (key: string, rec: { day: string; count: number }) => {
    delete memory[key];
    memory[key] = rec;
};

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

const pickIp = (v: any): string | null => {
    if (typeof v !== 'string') return null;
    // The LAST x-forwarded-for hop is the one the platform appended — the
    // client-supplied leading entries are trivially spoofable. Cap + charset
    // the value since it becomes a counter key.
    const s = v.split(',').map((x) => x.trim()).filter(Boolean).pop() || '';
    return s.length > 0 && s.length <= 64 && /^[0-9a-fA-F:.%_\-]+$/.test(s) ? s : null;
};

/* Proxy headers are only trustworthy when the platform itself rewrites the
   chain. On Vercel the edge appends the observed client IP last (and
   VERCEL=1 is always set in functions), so the .pop() above keeps just that
   hop. Off-Vercel EVERY one of these headers — x-vercel-forwarded-for
   included, a caller could simply set it — is client-writable, and the TCP
   peer is the only unspoofable source. A self-hosted deploy behind a known
   proxy can opt back into header trust with TRUST_PROXY=1.
   Checked per call, like getSupabase() — env is fixed at boot anyway, but a
   module-scope read would freeze it before tests/config get a say. */
const trustProxyHeaders = () => !!process.env.VERCEL || process.env.TRUST_PROXY === '1';

/** The platform-observed client IP — not the caller's claim. */
export const resolveNetIp = (req: any): string | null =>
    (trustProxyHeaders()
        ? pickIp(req.headers?.['x-vercel-forwarded-for']) ||
          pickIp(req.headers?.['x-forwarded-for']) ||
          pickIp(req.headers?.['x-real-ip'])
        : null) ||
    pickIp(req.socket?.remoteAddress) ||
    null;

/**
 * Resolve who is calling. If a valid Supabase JWT is present we return the
 * authenticated uuid (authed: true); otherwise we fall back to the anonymous
 * x-user-id header / IP. `ip` is the platform-observed address regardless of
 * auth state — anonymous callers are additionally keyed on it.
 */
export const resolveUser = async (req: any): Promise<{ userId: string; authed: boolean; isAnon: boolean; ip: string | null }> => {
    const authHeader = req.headers?.['authorization'] || req.headers?.['Authorization'];
    const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : null;

    const sb = getSupabase();
    if (token && sb) {
        try {
            const { data, error } = await sb.auth.getUser(token);
            if (!error && data?.user?.id) {
                /* is_anonymous marks Supabase anonymous-auth users: their JWT
                   verifies, but the uid behind it is freely re-mintable, so it
                   is NOT a stable identity for quota purposes. Older projects
                   may not emit the flag — absent reads as non-anon (the prior
                   behavior), and hCaptcha on the auth side still gates minting. */
                return { userId: data.user.id, authed: true, isAnon: data.user.is_anonymous === true, ip: resolveNetIp(req) };
            }
        } catch {
            /* fall through to anonymous */
        }
    }

    // x-user-id is a label, never a credential — bound it.
    const header = req.headers?.['x-user-id'];
    const ip = resolveNetIp(req);
    if (header && typeof header === 'string' && header.trim()) {
        return { userId: header.trim().slice(0, 128), authed: false, isAnon: true, ip };
    }
    return { userId: ip || 'anonymous', authed: false, isAnon: true, ip };
};

/**
 * Require a verified Supabase JWT — for endpoints that read or mutate a user's
 * stored data (notes, sessions). Replies 401 and returns null when absent.
 */
export const requireAuth = async (req: any, res: any): Promise<{ userId: string } | null> => {
    const { userId, authed } = await resolveUser(req);
    if (!authed) {
        res.status(401).json({ error: 'AUTH_REQUIRED' });
        return null;
    }
    return { userId };
};

/** Backwards-compatible synchronous id resolver (anonymous only). */
export const getUserId = (req: any): string => {
    const header = req.headers?.['x-user-id'];
    if (header && typeof header === 'string' && header.length > 0) return header.slice(0, 128);
    return resolveNetIp(req) || 'anonymous';
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
// Anonymous fallback path (daily counters in `usage_counters`)
//
// Counter keys:
//   default bucket:  <userId>              (unchanged from v1 — rows carry over)
//   named bucket:    <bucket>:<userId>
//   IP pin:          ip:<bucket|ai>:<ip>
// The IP pin is enforced at limit * ANON_IP_MULT so rotating x-user-id can't
// outrun it, while shared networks still get several browsers' worth.
// ---------------------------------------------------------------------------

const anonStatus = (used: number, limit: number): UsageStatus => ({
    used,
    limit,
    remaining: Math.max(0, limit - used),
    reachedLimit: used >= limit,
});

const counterKey = (userId: string, bucket?: string) => (bucket ? `${bucket}:${userId}` : userId);
const ipKey = (ip: string, bucket?: string) => `ip:${bucket || 'ai'}:${ip}`;

const anonReadKey = async (key: string): Promise<number> => {
    const day = today();
    const sb = getSupabase();
    if (sb) {
        try {
            const { data } = await sb.from('usage_counters').select('count').eq('user_id', key).eq('day', day).maybeSingle();
            return data?.count || 0;
        } catch {
            /* fall through to memory */
        }
    }
    const rec = memory[key];
    return rec && rec.day === day ? rec.count : 0;
};

/** Atomically consume one use of a counter key. Returns the new used count. */
const anonConsumeKey = async (key: string, limit: number): Promise<{ allowed: boolean; used: number }> => {
    const day = today();
    const sb = getSupabase();
    if (sb) {
        try {
            /* Atomic conditional consume (supabase_schema.sql ≥ v2): one UPDATE
               that increments only while under the limit — concurrent calls
               can't all slip through. */
            const { data, error } = await sb.rpc('consume_daily_usage', { p_user_id: key, p_day: day, p_limit: limit });
            if (!error && typeof data === 'number') {
                return data < 0 ? { allowed: false, used: -data } : { allowed: true, used: data };
            }
            /* Legacy schema (function not installed): non-atomic read+upsert.
               Run the updated supabase_schema.sql to close the race. */
            const { data: row } = await sb.from('usage_counters').select('count').eq('user_id', key).eq('day', day).maybeSingle();
            const used = row?.count || 0;
            if (used >= limit) return { allowed: false, used };
            await sb.from('usage_counters').upsert({ user_id: key, day, count: used + 1 }, { onConflict: 'user_id,day' });
            return { allowed: true, used: used + 1 };
        } catch {
            /* fall through to memory */
        }
    }
    const rec = memory[key] && memory[key].day === day ? memory[key] : { day, count: 0 };
    if (rec.count >= limit) {
        memCompact(day);
        memSet(key, rec);
        return { allowed: false, used: rec.count };
    }
    rec.count += 1;
    memCompact(day);
    memSet(key, rec);
    return { allowed: true, used: rec.count };
};

/** Give back one reserved use of a counter key. */
const anonRefundKey = async (key: string): Promise<number | null> => {
    const day = today();
    const sb = getSupabase();
    if (sb) {
        try {
            const { data, error } = await sb.rpc('refund_daily_usage', { p_user_id: key, p_day: day });
            if (!error && typeof data === 'number') return data;
            /* Legacy schema (refund RPC not installed): mirror the consume
               fallback — a non-atomic decrement on the counter row. Without
               this the RPC-less path charges Postgres but refunds only the
               in-memory map, leaking quota on every failed AI call. */
            const { data: row } = await sb.from('usage_counters').select('count').eq('user_id', key).eq('day', day).maybeSingle();
            if (!row) return 0;
            const count = Math.max(0, (row.count || 0) - 1);
            await sb.from('usage_counters').update({ count }).eq('user_id', key).eq('day', day);
            return count;
        } catch {
            /* fall through to memory */
        }
    }
    const rec = memory[key] && memory[key].day === day ? memory[key] : { day, count: 0 };
    rec.count = Math.max(0, rec.count - 1);
    memCompact(day);
    memSet(key, rec);
    return rec.count;
};

interface AnonCharge {
    idKey: string;
    ipKey?: string;
}

/**
 * Consume one anonymous use: the caller's id bucket at `limit`, pinned by the
 * platform-IP bucket at `ipLimit`. Only the keys actually charged are returned
 * so a refund never credits a bucket that was never debited.
 */
const anonConsume = async (
    userId: string,
    ip: string | null,
    opts: { bucket?: string; limit: number; ipLimit: number },
): Promise<{ allowed: boolean; status: UsageStatus; charge: AnonCharge | null }> => {
    const idKey = counterKey(userId, opts.bucket);
    const idRes = await anonConsumeKey(idKey, opts.limit);
    if (!idRes.allowed) return { allowed: false, status: anonStatus(idRes.used, opts.limit), charge: null };

    if (ip) {
        const k = ipKey(ip, opts.bucket);
        const ipRes = await anonConsumeKey(k, opts.ipLimit);
        if (!ipRes.allowed) {
            // Undo the id charge — the deny belongs to the IP pin, not the id.
            // Report the PIN's status (matching the authed path): the caller
            // is blocked by the ipLimit pool, and surfacing the refunded id
            // counter as remaining>0 would lie about why the 429 fired.
            await anonRefundKey(idKey);
            return { allowed: false, status: anonStatus(ipRes.used, opts.ipLimit), charge: null };
        }
        return { allowed: true, status: anonStatus(idRes.used, opts.limit), charge: { idKey, ipKey: k } };
    }
    return { allowed: true, status: anonStatus(idRes.used, opts.limit), charge: { idKey } };
};

const anonGetUsage = async (userId: string, bucket?: string, limit?: number): Promise<UsageStatus> => {
    const L = limit ?? DAILY_LIMIT;
    return anonStatus(await anonReadKey(counterKey(userId, bucket)), L);
};

const authedRefund = async (sb: any, userId: string, tokens: number): Promise<UsageStatus | null> => {
    try {
        /* decrement_usage must exist in the project DB alongside
           increment_usage (see supabase_schema.sql note). Hand back the same
           request+token estimate that was charged so failed calls don't drift
           the token counter upward. */
        await sb.rpc('decrement_usage', { p_user_id: userId, p_requests: 1, p_tokens: tokens });
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

/** Read current usage without consuming quota. When the caller is also
 *  IP-pinned (unauthed fallback, or anonymous-auth JWT), the badge should
 *  reflect the BINDING pool — reporting only the id counter would show
 *  remaining>0 while every call 429s on the pin. */
export const getUsageFor = async (
    userId: string,
    authed: boolean,
    opts: { bucket?: string; limit?: number; ipLimit?: number; ip?: string | null; isAnon?: boolean } = {},
): Promise<UsageStatus> => {
    const sb = getSupabase();
    const limit = opts.limit ?? DAILY_LIMIT;
    const ipLimit = opts.ipLimit ?? limit * ANON_IP_MULT;
    if (authed && sb && !opts.bucket) {
        const s = await authedGetUsage(sb, userId);
        if (s) {
            if (opts.isAnon && opts.ip) {
                const pin = anonStatus(await anonReadKey(ipKey(opts.ip)), ipLimit);
                if (pin.remaining < s.remaining) return pin;
            }
            return s;
        }
    }
    const idStatus = await anonGetUsage(userId, opts.bucket, limit);
    if (opts.ip) {
        const pin = anonStatus(await anonReadKey(ipKey(opts.ip, opts.bucket)), ipLimit);
        if (pin.remaining < idStatus.remaining) return pin;
    }
    return idStatus;
};

const sendUsageHeaders = (res: any, status: UsageStatus, bucket?: string) => {
    res.setHeader('x-usage-used', String(status.used));
    res.setHeader('x-usage-limit', String(status.limit));
    res.setHeader('x-usage-remaining', String(status.remaining));
    /* Scope marker: a named bucket's numbers describe THAT daily pool, not
       the shared AI quota — the client's badge must ignore them. 'main' is
       sent explicitly so a strict client needn't guess what absence means. */
    res.setHeader('x-usage-bucket', bucket || 'main');
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
 *
 * opts.bucket gives an endpoint its own counter (e.g. 'transcribe') so it
 * stays bounded without eating the main AI quota; opts.limit overrides the
 * daily cap for that bucket. Bucketed endpoints always use the daily-counter
 * ledger — the monthly authed ledger covers the unbucketed AI calls.
 */
export const reserveLimit = async (
    req: any,
    res: any,
    opts: { bucket?: string; limit?: number; ipLimit?: number } = {},
): Promise<UsageTicket | null> => {
    const { userId, authed, isAnon, ip } = await resolveUser(req);
    const sb = getSupabase();
    const limit = opts.limit ?? DAILY_LIMIT;
    const ipLimit = opts.ipLimit ?? limit * ANON_IP_MULT;

    let via: 'authed' | 'anon' = 'anon';
    let charge: AnonCharge | null = null;
    let authedTokens = 0;
    let authedIpKey: string | null = null;
    let result: { allowed: boolean; status: UsageStatus } | null = null;

    if (authed && sb && !opts.bucket) {
        authedTokens = estimateTokens(req.body);
        result = await authedConsume(sb, userId, authedTokens);
        if (result?.allowed && isAnon && ip) {
            /* Anonymous-auth uids are freely re-mintable, so the uid-keyed
               monthly ledger alone can't bound scripted rotation — enabling
               anonymous sign-in without the IP pin would give each fresh uid
               a full monthly allowance. Charge the daily IP pin alongside:
               one IP can only mint ipLimit requests/day no matter how many
               anonymous accounts it rotates through. (hCaptcha on the auth
               side — see supabase_schema.sql — gates the minting itself.) */
            const k = ipKey(ip);
            const ipRes = await anonConsumeKey(k, ipLimit);
            if (!ipRes.allowed) {
                // Undo the monthly charge — the deny belongs to the IP pin.
                await authedRefund(sb, userId, authedTokens);
                result = { allowed: false, status: anonStatus(ipRes.used, ipLimit) };
            } else {
                authedIpKey = k;
            }
        }
        if (result?.allowed) via = 'authed';
    }
    if (!result) {
        // Anonymous callers — and bucketed endpoints for EVERYONE — use the
        // daily counters: the id bucket pinned by the platform-IP bucket so
        // rotating x-user-id can't outrun it. The pin is unconditional on
        // this path: a verified uid is not uniqueness proof (anonymous auth
        // mints a fresh one per sign-in), and the monthly-ledger attempt
        // above only counts when its RPCs actually answered — every caller
        // that lands here is on a freely claimable id, so the IP pin is the
        // only thing that can't be rotated.
        const r = await anonConsume(userId, ip, { bucket: opts.bucket, limit, ipLimit });
        result = r;
        charge = r.charge;
    }
    sendUsageHeaders(res, result.status, opts.bucket);
    if (!result.allowed) {
        res.status(429).json({ error: 'LIMIT_REACHED', bucket: opts.bucket || 'main', usage: result.status });
        return null;
    }

    return {
        userId,
        authed,
        refund: async () => {
            try {
                // Refund every ledger that was charged — the monthly ledger
                // AND, for anonymous-authed callers, the daily IP pin.
                if (via === 'authed') {
                    if (!sb) return;
                    const status = await authedRefund(sb, userId, authedTokens);
                    if (authedIpKey) await anonRefundKey(authedIpKey);
                    if (status) sendUsageHeaders(res, status, opts.bucket);
                    return;
                }
                if (!charge) return;
                const used = await anonRefundKey(charge.idKey);
                if (charge.ipKey) await anonRefundKey(charge.ipKey);
                if (used !== null) sendUsageHeaders(res, anonStatus(used, limit), opts.bucket);
            } catch {
                /* refund failures must not fail the request */
            }
        },
    };
};
