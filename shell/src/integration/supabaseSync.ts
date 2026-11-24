/* User-consented Supabase mirror for the canonical store. Kept in the shell
   bootstrap so sync can start from Settings without loading Margin. Anonymous
   auth is not initialized until persisted sync consent is on. */
import { createPinnedSyncClient, supabase } from '../apps/margin/services/supabaseClient';
import { initAuth } from '../apps/margin/services/usageService';

const SYNC_OWNER_KEY = 'iterra.v1.sync.owner';
const SYNC_ENABLED_KEY = 'iterra.v1.sync.enabled';
let syncUid: string | null = null;
let syncToken: string | null = null;
let syncRetry: ReturnType<typeof setTimeout> | null = null;
let syncWatcher = false;
let syncAttempt = 0;
let attachFlight: Promise<void> | null = null;
let pendingSyncRequest: { uid?: string } | null = null;

function syncConsent(): boolean {
  try { return window.localStorage?.getItem(SYNC_ENABLED_KEY) === '1'; } catch { return false; }
}

export function syncIdentityMatches(owner: string | null, candidate: string | null): boolean {
  return !!candidate && (!owner || owner === candidate);
}

export function syncAuthAction(event: string, uid: string | null, enabled: boolean): 'detach' | 'attach' | 'none' {
  if (event === 'SIGNED_OUT') return 'detach';
  // INITIAL_SESSION commonly arrives without a user. With explicit consent,
  // let the attach path initialize anonymous auth and report its real failure.
  if (!uid) return enabled ? 'attach' : 'none';
  return enabled ? 'attach' : 'none';
}

type SyncLockManager = Pick<LockManager, 'request'>;
type SyncOwnerStorage = Pick<Storage, 'getItem' | 'setItem'>;

function availableSyncLocks(): SyncLockManager | undefined {
  return typeof navigator !== 'undefined' ? navigator.locks : undefined;
}

/** Bind the local shared store to exactly one auth uid while the lock is held.
    Keep `work` inside the lock so another tab cannot attach a different uid
    between writing the owner marker and the initial pull/push finishing. */
export async function withSyncOwnerLock<T>(
  uid: string,
  work: () => Promise<T>,
  locks: SyncLockManager | undefined = availableSyncLocks(),
  storage: SyncOwnerStorage = window.localStorage,
): Promise<{ ownerMatches: boolean; value?: T }> {
  if (!locks?.request) {
    throw new Error('Shared record sync is paused because this browser cannot coordinate sync ownership safely across tabs.');
  }
  return locks.request('iterra.sync.owner', { mode: 'exclusive' }, async () => {
    const owner = storage.getItem(SYNC_OWNER_KEY);
    if (!syncIdentityMatches(owner, uid)) return { ownerMatches: false };
    if (!owner) storage.setItem(SYNC_OWNER_KEY, uid);
    // Re-read after the write; fail closed if another writer bypassed the lock.
    if (storage.getItem(SYNC_OWNER_KEY) !== uid) return { ownerMatches: false };
    return { ownerMatches: true, value: await work() };
  });
}

function stopSyncRetry() {
  if (syncRetry) clearTimeout(syncRetry);
  syncRetry = null;
}

function detachItterraSync(reason: string) {
  syncAttempt++;
  stopSyncRetry();
  syncUid = null;
  syncToken = null;
  const it = window.iterra;
  it?.sync?.detach?.(reason);
}

function toRemoteEntity(row: any): any {
  const st = Date.parse(row?.synced_at) || 0;
  const body = row?.body && typeof row.body === 'object' ? row.body : {};
  if (row?.deleted) {
    return {
      key: row.key || body.key,
      __deleted: true,
      deletedAt: typeof row.deletedAt === 'number' ? row.deletedAt : Number(row.deletedAt) || st,
      updatedAt: body.updatedAt,
    };
  }
  return body;
}

export function createSupabaseSyncAdapter(sb: any, uid: string, options: {
  pageSize?: number;
  fullScanEvery?: number;
  assertIdentity?: () => Promise<void>;
} = {}) {
  let pullCount = 0;
  const PAGE = options.pageSize ?? 500;
  const FULL_SCAN_EVERY = options.fullScanEvery ?? 10;
  const assertIdentity = options.assertIdentity ?? (() => assertActiveSyncIdentity(sb, uid));
  return {
    name: `supabase:${uid}`,
    pull: async (since: number) => {
      await assertIdentity();
      const full = (++pullCount % FULL_SCAN_EVERY) === 0;
      const lower = full ? new Date(0).toISOString() : new Date(Math.max(0, since)).toISOString();
      const { data: latest, error: latestError } = await sb
        .from('iterra_entities').select('synced_at').eq('user_id', uid)
        .order('synced_at', { ascending: false }).limit(1).maybeSingle();
      if (latestError) throw latestError;
      if (!latest?.synced_at) return { rows: [], watermark: since };
      const upper = latest.synced_at;
      const out: any[] = [];
      let watermark = since;
      let mode: 'initial' | 'same' | 'after' = 'initial';
      let cursorTime = '';
      let cursorKey = '';
      let pages = 0;
      for (;;) {
        await assertIdentity();
        if (++pages > 10000) throw new Error('Sync pull exceeded its bounded page count. Retry while online.');
        let query = sb.from('iterra_entities')
          .select('key, body, deleted, "deletedAt", synced_at')
          .eq('user_id', uid).lte('synced_at', upper);
        if (mode === 'initial') query = query.gte('synced_at', lower)
          .order('synced_at', { ascending: true }).order('key', { ascending: true });
        else if (mode === 'same') query = query.eq('synced_at', cursorTime)
          .gt('key', cursorKey).order('key', { ascending: true });
        else query = query.gt('synced_at', cursorTime)
          .order('synced_at', { ascending: true }).order('key', { ascending: true });
        const { data: rows, error } = await query.range(0, PAGE - 1);
        if (error) throw error;
        const batch = rows ?? [];
        for (const row of batch) {
          const stamp = Date.parse(row.synced_at) || 0;
          if (stamp > watermark) watermark = stamp;
          out.push(toRemoteEntity(row));
        }
        if (!batch.length) {
          if (mode === 'same') { mode = 'after'; continue; }
          break;
        }
        const last = batch[batch.length - 1];
        cursorTime = last.synced_at;
        cursorKey = last.key;
        if (mode === 'same') {
          if (batch.length < PAGE) mode = 'after';
          continue;
        }
        if (batch.length < PAGE) break;
        mode = 'same';
      }
      return { rows: out, watermark };
    },
    put: async (e: any) => {
      await assertIdentity();
      const key = e.key ?? `${e.app}:${e.type}:${e.id}`;
      const updatedAt = e.updatedAt ?? Date.now();
      const { data: result, error } = await sb.rpc('iterra_entity_put', {
        p_key: key, p_app: e.app, p_type: e.type, p_course_id: e.courseId ?? null,
        p_updated_at: updatedAt, p_body: e,
      });
      if (error) throw error;
      if (result === 'applied') return { status: 'applied' };
      if (result !== 'stale') throw new Error(`Unexpected entity put result: ${String(result)}`);
      await assertIdentity();
      const { data: row, error: readError } = await sb.from('iterra_entities')
        .select('key, body, deleted, "deletedAt", synced_at')
        .eq('user_id', uid).eq('key', key).maybeSingle();
      if (readError) throw readError;
      if (!row) throw new Error('A stale entity write had no owner-scoped winning row to reconcile.');
      return { status: 'stale', remote: toRemoteEntity(row) };
    },
    remove: async (key: string, deletedAt = Date.now()) => {
      await assertIdentity();
      const { data: result, error } = await sb.rpc('iterra_entity_remove', {
        p_key: key, p_deleted_at: deletedAt,
      });
      if (error) throw error;
      if (result === 'applied') return { status: 'applied' };
      if (result !== 'stale') throw new Error(`Unexpected entity remove result: ${String(result)}`);
      await assertIdentity();
      const { data: row, error: readError } = await sb.from('iterra_entities')
        .select('key, body, deleted, "deletedAt", synced_at')
        .eq('user_id', uid).eq('key', key).maybeSingle();
      if (readError) throw readError;
      if (!row) throw new Error('A stale entity delete had no owner-scoped winning row to reconcile.');
      return { status: 'stale', remote: toRemoteEntity(row) };
    },
    onConflict: (l: any, r: any) => ((r?.updatedAt || 0) >= (l?.updatedAt || 0) ? r : l),
  };
}

async function assertActiveSyncIdentity(sb: any, uid: string): Promise<void> {
  if (!syncConsent()) throw new Error('Shared record sync is disabled.');
  if (window.localStorage.getItem(SYNC_OWNER_KEY) !== uid) {
    throw new Error('Shared record sync is paused because this browser identity no longer owns the local sync marker.');
  }
  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  if (data.session?.user?.id !== uid) {
    throw new Error('Shared record sync is paused because the signed-in identity changed.');
  }
}

async function attachItterraSync(sessionUid: string | undefined, attempt: number) {
  const it = window.iterra;
  if (!it?.sync?.attach || !supabase || !syncConsent()) return;
  const sb = supabase;
  let uid = sessionUid;
  if (!uid) {
    // Auth startup is explicitly gated by consent. initAuth is idempotent with
    // Margin's existing usage-limit auth if that place is also open.
    await initAuth();
    if (attempt !== syncAttempt || !syncConsent()) return;
  }
  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  const session = data.session;
  if (!session?.user?.id || !session.access_token) {
    throw new Error('supabase-auth-unavailable');
  }
  if (uid && uid !== session.user.id) {
    throw new Error('The Supabase identity changed before sync could attach.');
  }
  uid = session.user.id;
  const accessToken = session.access_token;
  if (attempt !== syncAttempt || !syncConsent()) return;
  if (syncUid === uid && syncToken === accessToken) return;
  const pinnedClient = createPinnedSyncClient(accessToken);
  const bound = await withSyncOwnerLock(uid, async () => {
    if (attempt !== syncAttempt || !syncConsent()) return undefined;
    // Recheck immediately before starting I/O while the cross-tab lock is held.
    if (window.localStorage.getItem(SYNC_OWNER_KEY) !== uid) return undefined;
    return it.sync.attach(createSupabaseSyncAdapter(pinnedClient, uid, {
      assertIdentity: () => assertActiveSyncIdentity(sb, uid),
    }));
  });
  if (!bound.ownerMatches) {
    syncUid = null;
    it.sync.detach?.('identity-mismatch');
    return;
  }
  const res = bound.value;
  if (attempt !== syncAttempt || !syncConsent()) {
    it.sync.detach?.('superseded-auth-change');
    return;
  }
  if (res && res.ok !== false) {
    syncUid = uid;
    syncToken = accessToken;
    stopSyncRetry();
    return;
  }
  throw new Error(res?.error || 'Could not connect shared record sync.');
}

function scheduleSync(uid?: string | null) {
  pendingSyncRequest = { uid: uid || undefined };
  syncAttempt++;
  if (attachFlight) return;
  const request = pendingSyncRequest;
  pendingSyncRequest = null;
  const attempt = syncAttempt;
  attachFlight = new Promise<void>((resolve) => setTimeout(resolve, 0))
    .then(() => attachItterraSync(request?.uid, attempt))
    .catch((e) => {
      const it = window.iterra;
      if (it?.sync?.status) it.sync.setPausedReason?.(String(e?.message || e));
      if (!syncRetry && syncConsent()) {
        syncRetry = setTimeout(() => { syncRetry = null; scheduleSync(); }, 30000);
      }
    })
    .finally(() => {
      attachFlight = null;
      if (pendingSyncRequest) {
        const next = pendingSyncRequest;
        pendingSyncRequest = null;
        scheduleSync(next.uid);
      }
    });
}

/** Called from the eager shell entry point; it installs listeners only.
    With consent off it creates no anonymous user and performs no data access. */
export function watchItterraSync() {
  if (syncWatcher) return;
  syncWatcher = true;
  const it = window.iterra;
  it?.sync?.setProviderAvailable?.(!!supabase);
  if (!supabase) return;
  supabase.auth.onAuthStateChange((event: string, session: any) => {
    // Auth callbacks run under Supabase's lock; do work after they return.
    setTimeout(() => {
      const uid = session?.user?.id || null;
      const action = syncAuthAction(event, uid, syncConsent());
      if (action === 'detach') {
        pendingSyncRequest = null;
        detachItterraSync(syncConsent() ? 'signed-out' : 'disabled');
      } else if (action === 'attach') scheduleSync(uid);
    }, 0);
  });
  window.addEventListener('iterra:sync-consent-changed', (event: any) => {
    if (!event?.detail?.enabled) {
      pendingSyncRequest = null;
      detachItterraSync('disabled');
    } else scheduleSync();
  });
  window.addEventListener('storage', (event: StorageEvent) => {
    if (event.key !== SYNC_ENABLED_KEY) return;
    if (event.newValue !== '1') {
      pendingSyncRequest = null;
      detachItterraSync('disabled');
    } else scheduleSync();
  });
  if (syncConsent()) scheduleSync();
}

declare const window: any;
