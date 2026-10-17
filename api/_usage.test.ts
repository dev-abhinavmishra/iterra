import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reserveLimit, resolveNetIp, getUsageFor } from './_usage';

// No SUPABASE_URL/KEY in env → in-memory ledger. Deterministic.
// The supabase-js mock below only activates once the tests stub the env —
// getSupabase() returns null before createClient is ever called.

const mkRes = () => {
    const headers: Record<string, string> = {};
    const out: any = { headers, statusCode: 200, body: null };
    out.setHeader = (k: string, v: string) => { headers[k.toLowerCase()] = String(v); };
    out.status = (c: number) => { out.statusCode = c; return out; };
    out.json = (b: any) => { out.body = b; return out; };
    return out;
};

const mkReq = (over: any = {}) => ({
    headers: {},
    socket: { remoteAddress: '10.9.8.7' },
    body: {},
    ...over,
});

/* ── fake Supabase for the authed paths ──
   Counters are hoisted so tests can reset/inspect them. rpc() mirrors the
   contract in supabase_schema.sql: consume_daily_usage returns the new count
   (or -count when over the limit); increment_usage answers {allowed}; the
   read/get paths exist so getUsageFor works. Table access throws — every
   exercised path must go through the RPCs. */
const fake = vi.hoisted(() => {
    const counters = new Map<string, number>();          // `${key}|${day}`
    const monthly = new Map<string, number>();           // uid → requests_used
    const CAP = 3;
    const client = {
        auth: {
            getUser: async (t: string) => {
                if (t.startsWith('anon-jwt-')) {
                    return { data: { user: { id: 'uid-' + t.slice(9), is_anonymous: true } }, error: null };
                }
                if (t === 'real-jwt') {
                    return { data: { user: { id: 'uid-real', is_anonymous: false } }, error: null };
                }
                return { data: { user: null }, error: { message: 'bad token' } };
            },
        },
        rpc: async (name: string, args: any) => {
            if (name === 'consume_daily_usage') {
                const k = `${args.p_user_id}|${args.p_day}`;
                const cur = counters.get(k) || 0;
                if (cur >= args.p_limit) return { data: -cur, error: null };
                counters.set(k, cur + 1);
                return { data: cur + 1, error: null };
            }
            if (name === 'refund_daily_usage') {
                const k = `${args.p_user_id}|${args.p_day}`;
                const cur = Math.max(0, (counters.get(k) || 0) - 1);
                counters.set(k, cur);
                return { data: cur, error: null };
            }
            if (name === 'increment_usage') {
                const cur = monthly.get(args.p_user_id) || 0;
                if (cur >= CAP) return { data: { allowed: false }, error: null };
                monthly.set(args.p_user_id, cur + 1);
                return { data: { allowed: true }, error: null };
            }
            if (name === 'decrement_usage') {
                monthly.set(args.p_user_id, Math.max(0, (monthly.get(args.p_user_id) || 0) - 1));
                return { data: null, error: null };
            }
            if (name === 'get_user_limits') {
                const used = monthly.get(args.p_user_id) || 0;
                return { data: { requests_used: used, request_limit: CAP, requests_remaining: Math.max(0, CAP - used) }, error: null };
            }
            return { data: null, error: { message: 'unknown rpc ' + name } };
        },
        /* Reads of usage_counters are legitimate (anonReadKey selects the
           count) — serve them from the counter map; everything else stays
           closed so exercised writes still go through the RPCs. */
        from: (table: string) => {
            if (table !== 'usage_counters') throw new Error('no table access in fake — RPCs only');
            const q: any = { _uid: null as any, _day: null as any };
            q.select = () => q;
            q.eq = (k: string, v: any) => { if (k === 'user_id') q._uid = v; if (k === 'day') q._day = v; return q; };
            q.maybeSingle = async () => ({ data: { count: fake.counters.get(`${q._uid}|${q._day}`) ?? 0 }, error: null });
            return q;
        },
    };
    return { counters, monthly, client, CAP };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fake.client }));

describe('reserveLimit bucket scoping', () => {
    it('marks bucketed responses with x-usage-bucket and sends the bucket in the 429 body', async () => {
        const req = mkReq({ headers: { 'x-user-id': 'u-bucket-test' } });
        // drain a tiny bucket
        for (let i = 0; i < 2; i++) {
            const res = mkRes();
            const t = await reserveLimit(req, res, { bucket: 'transcribe', limit: 2 });
            expect(t).not.toBeNull();
            expect(res.headers['x-usage-bucket']).toBe('transcribe');
        }
        const res = mkRes();
        const t = await reserveLimit(req, res, { bucket: 'transcribe', limit: 2 });
        expect(t).toBeNull();
        expect(res.statusCode).toBe(429);
        expect(res.body.error).toBe('LIMIT_REACHED');
        expect(res.body.bucket).toBe('transcribe');
        expect(res.headers['x-usage-bucket']).toBe('transcribe');
    });

    it('marks unbucketed responses as main', async () => {
        const req = mkReq({ headers: { 'x-user-id': 'u-main-test' } });
        const res = mkRes();
        const t = await reserveLimit(req, res);
        expect(t).not.toBeNull();
        expect(res.headers['x-usage-bucket']).toBe('main');
    });

    it('IP-pins the anonymous path even for a verified-uid fallback (rotation bounded)', async () => {
        // same IP, rotating x-user-id — each new id gets a fresh id bucket but
        // the ip:<bucket>:<ip> counter at limit*ANON_IP_MULT is shared
        const ip = '203.0.113.9';
        for (let i = 0; i < 3; i++) {
            const res = mkRes();
            const t = await reserveLimit(
                mkReq({ headers: { 'x-user-id': `rot-${i}` }, socket: { remoteAddress: ip } }),
                res,
                { bucket: 'title', limit: 2, ipLimit: 3 },
            );
            expect(t).not.toBeNull();
        }
        const res = mkRes();
        const t = await reserveLimit(
            mkReq({ headers: { 'x-user-id': 'rot-fresh' }, socket: { remoteAddress: ip } }),
            res,
            { bucket: 'title', limit: 2, ipLimit: 3 },
        );
        expect(t).toBeNull();
        expect(res.statusCode).toBe(429);
        expect(res.body.bucket).toBe('title');
        /* The deny belongs to the IP pin — the 429 must report the PIN's
           exhausted pool (3/3), not the id bucket that was just refunded
           (which would claim remaining>0 under a 429). */
        expect(res.body.usage.limit).toBe(3);
        expect(res.body.usage.remaining).toBe(0);
    });
});

describe('resolveNetIp header trust', () => {
    it('ignores client-sent proxy headers when not on Vercel', () => {
        delete process.env.VERCEL;
        const req = mkReq({
            headers: {
                'x-forwarded-for': '1.2.3.4',   // attacker-claimed
                'x-vercel-forwarded-for': '5.6.7.8',
            },
        });
        expect(resolveNetIp(req)).toBe('10.9.8.7'); // the socket peer
    });

    it('takes the platform-appended last hop on Vercel', () => {
        process.env.VERCEL = '1';
        const req = mkReq({
            headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1, 198.51.100.23' },
        });
        expect(resolveNetIp(req)).toBe('198.51.100.23');
        delete process.env.VERCEL;
    });
});

describe('authed path (mocked Supabase)', () => {
    beforeEach(() => {
        vi.stubEnv('SUPABASE_URL', 'https://fake.supabase.co');
        vi.stubEnv('SUPABASE_KEY', 'service-role-key');
        fake.counters.clear();
        fake.monthly.clear();
        delete process.env.VERCEL;
    });
    afterEach(() => vi.unstubAllEnvs());

    it('anonymous-auth uids are ALSO pinned by client IP — uid rotation is bounded', async () => {
        const ip = '203.0.113.55';
        // ipLimit=2: two rotated anonymous accounts exhaust the pin even though
        // each fresh uid still has monthly quota (cap 3) left.
        for (const uid of ['1', '2']) {
            const res = mkRes();
            const t = await reserveLimit(
                mkReq({
                    headers: { authorization: `Bearer anon-jwt-${uid}` },
                    socket: { remoteAddress: ip },
                }),
                res,
                { ipLimit: 2 },
            );
            expect(t).not.toBeNull();
        }
        const res = mkRes();
        const t = await reserveLimit(
            mkReq({
                headers: { authorization: 'Bearer anon-jwt-3' }, // a THIRD fresh uid
                socket: { remoteAddress: ip },
            }),
            res,
            { ipLimit: 2 },
        );
        expect(t).toBeNull();
        expect(res.statusCode).toBe(429);
        // The deny must not leave the third uid's monthly use charged.
        expect(fake.monthly.get('uid-3') ?? 0).toBe(0);
    });

    it('a non-anonymous JWT is NOT IP-pinned — monthly ledger alone decides', async () => {
        const ip = '203.0.113.55';
        // ipLimit=2 but monthly cap is 3: a real account gets all 3.
        for (let i = 0; i < fake.CAP; i++) {
            const res = mkRes();
            const t = await reserveLimit(
                mkReq({ headers: { authorization: 'Bearer real-jwt' }, socket: { remoteAddress: ip } }),
                res,
                { ipLimit: 2 },
            );
            expect(t).not.toBeNull();
        }
        // …then the monthly cap itself denies.
        const res = mkRes();
        const t = await reserveLimit(
            mkReq({ headers: { authorization: 'Bearer real-jwt' }, socket: { remoteAddress: ip } }),
            res,
            { ipLimit: 2 },
        );
        expect(t).toBeNull();
        expect(res.statusCode).toBe(429);
    });

    it('refund returns BOTH the monthly use and the IP pin for anon-authed callers', async () => {
        const ip = '198.51.100.7';
        const req = mkReq({ headers: { authorization: 'Bearer anon-jwt-9' }, socket: { remoteAddress: ip } });
        const t1 = await reserveLimit(req, mkRes(), { ipLimit: 1 });
        expect(t1).not.toBeNull();
        expect(fake.monthly.get('uid-9')).toBe(1);

        await t1!.refund();
        expect(fake.monthly.get('uid-9')).toBe(0);                     // monthly handed back
        const day = new Date().toISOString().slice(0, 10);
        expect(fake.counters.get(`ip:ai:${ip}|${day}`) ?? 0).toBe(0);    // pin handed back

        // …and the same caller can spend that use again after a failure.
        const t2 = await reserveLimit(req, mkRes(), { ipLimit: 1 });
        expect(t2).not.toBeNull();
    });

    it('getUsageFor reports the BINDING pool: anon-auth uid at an exhausted IP pin shows remaining 0', async () => {
        const ip = '192.0.2.77';
        // burn the shared IP pin (ipLimit=1) — the uid's monthly quota still
        // has headroom, but every call now 429s on the pin, so the badge
        // must report the pin's 0-remaining pool, not the monthly ledger.
        const t = await reserveLimit(
            mkReq({ headers: { authorization: 'Bearer anon-jwt-p' }, socket: { remoteAddress: ip } }),
            mkRes(),
            { ipLimit: 1 },
        );
        expect(t).not.toBeNull();
        const s = await getUsageFor('uid-p', true, { ip, isAnon: true, ipLimit: 1 });
        expect(s.remaining).toBe(0);
        expect(s.limit).toBe(1);
    });

    it('getUsageFor on the unauthed path also returns the pin when it is tighter', async () => {
        const ip = '198.51.100.44';
        for (let i = 0; i < 3; i++) {
            const t = await reserveLimit(
                mkReq({ headers: { 'x-user-id': `rot-g${i}` }, socket: { remoteAddress: ip } }),
                mkRes(),
                { bucket: 'title', limit: 2, ipLimit: 3 },
            );
            expect(t).not.toBeNull();
        }
        // a fresh id has 2/2 remaining on its own counter — but the shared
        // pin is at 3/3, so the reported usage is the pin's exhausted pool
        const s = await getUsageFor('rot-g-fresh', false, { ip, bucket: 'title', limit: 2, ipLimit: 3 });
        expect(s.limit).toBe(3);
        expect(s.remaining).toBe(0);
    });

    it('bucketed calls pin authed users by IP too (transcribe/title)', async () => {
        const ip = '192.0.2.4';
        for (const uid of ['a', 'b']) {
            const t = await reserveLimit(
                mkReq({ headers: { authorization: `Bearer anon-jwt-${uid}` }, socket: { remoteAddress: ip } }),
                mkRes(),
                { bucket: 'transcribe', limit: 1, ipLimit: 2 },
            );
            expect(t).not.toBeNull();
        }
        const res = mkRes();
        const t = await reserveLimit(
            mkReq({ headers: { authorization: 'Bearer anon-jwt-c' }, socket: { remoteAddress: ip } }),
            res,
            { bucket: 'transcribe', limit: 1, ipLimit: 2 },
        );
        expect(t).toBeNull();
        expect(res.statusCode).toBe(429);
        expect(res.body.bucket).toBe('transcribe');
    });
});
