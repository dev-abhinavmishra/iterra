# Sync — opt-in remote mirror for the canonical store

The store is local-first (IndexedDB, LS fallback). `iterra.sync.attach(adapter)`
adds an optional remote mirror behind one interface — the WHOLE store syncs,
not one app's tables. Margin already ships a Supabase client
(`services/supabaseClient.ts`, env `SUPABASE_URL` + `SUPABASE_ANON_KEY` at
build time); this sketch wires the canonical store to the same project.

## Interface (implemented in the hub)

```js
adapter = {
  name: 'supabase',
  pull: (since) => Promise<Entity[] | {rows: Entity[], watermark: number}>,
  put: (entity) => Promise<void>,       // called on every local put — MUST reject on failure
  remove: (key) => Promise<void>,       // optional — called on removes — MUST reject on failure
  onConflict: (local, remote) => remote // optional resolver — `local` is the real local copy or null
}
iterra.sync.attach(adapter)           // one at a time; attach again replaces
iterra.sync.attach(adapter, {pollMs}) // optional re-pull cadence (default 60s)
iterra.sync.status()                  // {attached, adapter, attachedAt, lastPull, error, queued}
```

**The pull filter must run on a server-arrival stamp, not the entity's own
`updatedAt`.** `updatedAt` is the writer's client clock at edit time — a
write that commits late (retry-queue drain, offline put, skewed device)
carries an old stamp and would sit permanently behind a checkpoint in that
domain. `pull` may return `{rows, watermark}` where `watermark` is the max
server-side commit stamp observed (e.g. a trigger-stamped `synced_at`
column); the hub persists `watermark − 60s` (overlap covers still-committing
writers) as the next `since`. A bare array is the legacy contract and falls
back to the reader's pull-start clock — correct only when remote writes
commit in pull order.

**Adapters must reject on write failure.** supabase-js (and most SDKs)
resolve HTTP-level errors as `{error}` instead of throwing — destructure
and `throw error` explicitly, or a denied write looks like success: no
`status().error`, no retry, silent divergence.

## Outbound retry queue

A failed `put`/`remove` is owed, not dropped. The op is enqueued (deduped
by key, capped at 500), persisted per adapter name under
`iterra.v1.sync.out`, and re-attempted on every successful pull tick —
offline writes land once the remote recovers, across reloads.

Entries carry `{op, key}` — never a snapshot — and `remove` entries also
carry `at`, the delete's wall-clock stamp. At drain time the queue re-reads
the CURRENT local entity, so:

- a `put` whose key was since deleted drops out (no stale-body clobber);
- a `remove` whose key is alive with `updatedAt > at` was genuinely
  re-created (user write, or a fresher remote edit merged in) and converts
  to a `put` of the live entity;
- a `remove` whose key is alive but stamped at-or-before `at` is the sync
  resurrecting a copy the failed remote delete never erased — the remote
  remove is re-attempted AND the local copy re-deleted, so a user's delete
  is never silently lost;
- a successful adapter op for a key discharges anything owed for it.

`status().queued` reports the backlog length; `status().error` records
the last failure while retries continue.

Attach pulls once, then re-pulls every 60s on the checkpoint — remote edits
from other devices land without a reload. A failed tick surfaces in
status().error and the next tick retries; overlapping ticks are skipped.

`since` is a per-adapter pull checkpoint persisted in
`iterra.v2.sync.ck` — in the adapter's watermark domain when it reports
one, else the timestamp captured just before the last successful pull
(NOT the newest local `updatedAt`, which would silently miss remote
updates to older entities). The checkpoint advances only when every row
merged cleanly — a storage-level merge failure re-fetches the window on
the next pull instead of permanently skipping the row.

## Merge semantics

Each remote row is compared against its own local copy:

- remote newer → `onConflict(local, remote)` → `store.put` (validation +
  quarantine apply to remote data too);
- local newer → pushed back out via `adapter.put` so the remote converges;
- equal `updatedAt` with divergent content → canonical comparison
  (key-sorted recursive stringify over the entity, sync-meta fields
  stripped): the canonically-LARGER body wins — identical on every
  replica, jsonb key-reordering-proof. `onConflict` is bypassed for ties:
  a custom resolver could pick differently per device and break
  convergence;
- remote tombstone (`__deleted`) → local remove, UNLESS the local copy was
  edited after `deletedAt` — that edit wins and pushes back out,
  resurrecting the remote row. An unstamped delete loses to any local
  copy rather than silently erasing it.

Merge writes are compare-and-swap: the winner is written only while the
local copy still matches what the resolution ran against — a user write
racing the merge aborts it, and the merge re-resolves against the newer
local (bounded retries; an exhausted retry owes the freshest state to the
queue). Merge puts keep the remote `updatedAt` — the store restamps on
ordinary writes, and inflating a merged row would masquerade it as the
freshest edit. Only the merged key's outbound ops are held while its
merge is in flight — a concurrent local put on any other key still goes
out — and ops suppressed inside the merge window are reconciled after it:
discharged if they were the merge's own echo, owed if a real local change
raced.

## Table

```sql
create table if not exists iterra_entities (
  user_id      text not null,
  key          text not null,             -- 'app:type:id'
  app          text not null,
  type         text not null,
  "courseId"   text,                      -- QUOTED: Postgres folds unquoted ids
  "updatedAt"  bigint not null,           -- WRITER's edit stamp — merge LWW only
  deleted      boolean not null default false,  -- tombstone: deletes propagate
  "deletedAt"  bigint,                    --   the delete's client-clock stamp
  synced_at    timestamptz not null default now(),  -- SERVER stamp — pull filter
  body         jsonb not null,            -- the whole entity
  primary key (user_id, key)
);
create index if not exists iterra_entities_pull_idx on iterra_entities (user_id, synced_at);
-- + a BEFORE INSERT/UPDATE trigger that (a) restamps synced_at on every
-- write and (b) refuses to resurrect a tombstone with a stale body
-- (updatedAt <= deletedAt) — a replayed queued put can't un-delete a newer
-- tombstone. RLS scopes rows to auth.uid(). Full DDL + in-place upgrade
-- ALTERs live in apps/margin/supabase_schema.sql.
```

Rows are owned: the adapter stamps `user_id` from the Supabase session and
only attaches once a session exists (anonymous sign-in must be enabled on
the project). Upserts conflict on `user_id,key` so two accounts can hold
the same `app:type:id` key without colliding.

## Implementation (wired — margin's adapter attaches at boot)

```ts
import { supabase } from '../services/supabaseClient';

export async function attachItterraSync() {
  const it = (window as any).iterra;
  if (!it?.sync?.attach || !supabase) return;   // env absent → stay local
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) return;                            // unsigned → stay local
  await it.sync.attach({
    name: `supabase:${uid}`,                    // checkpoint is per-owner
    pull: async (since) => {
      // Filter on synced_at — the DATABASE commit stamp. PAGE through the
      // result: PostgREST returns ~1000 rows max; ordering by synced_at+key
      // makes pages deterministic and the last row's synced_at the
      // observed watermark. Tombstones ship as {__deleted} markers.
      const out = [];
      let watermark = since;
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('iterra_entities')
          .select('key, body, deleted, "deletedAt", synced_at')
          .eq('user_id', uid)
          .gte('synced_at', new Date(since).toISOString())
          .order('synced_at', { ascending: true })
          .order('key', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        for (const r of data ?? []) {
          const st = Date.parse(r.synced_at) || 0;
          if (st > watermark) watermark = st;
          out.push(r.deleted
            ? { key: r.key, __deleted: true, deletedAt: r.deletedAt ?? st, updatedAt: r.body?.updatedAt }
            : r.body);
        }
        if (!data || data.length < PAGE) break;
      }
      return { rows: out, watermark };
    },
    put: async (e) => {
      // supabase-js resolves {error} rather than throwing — surface it so
      // the retry queue and status().error see the failure. deleted:false
      // resurrects a tombstoned row when the put's stamp wins LWW.
      const { error } = await supabase.from('iterra_entities').upsert({
        key: e.key ?? `${e.app}:${e.type}:${e.id}`,
        app: e.app, type: e.type, courseId: e.courseId ?? null,
        user_id: uid, updatedAt: e.updatedAt ?? Date.now(),
        deleted: false, deletedAt: null, body: e,
      }, { onConflict: 'user_id,key' });
      if (error) throw error;
    },
    remove: async (key) => {
      // SOFT delete — a hard DELETE leaves no trace for peers to pull.
      const { error } = await supabase.from('iterra_entities')
        .update({ deleted: true, deletedAt: Date.now() })
        .eq('key', key).eq('user_id', uid);
      if (error) throw error;
    },
    onConflict: (l, r) => ((r?.updatedAt || 0) >= (l?.updatedAt || 0) ? r : l),
  });
}
```

`watchItterraSync()` runs inside `registerAdapter()` — it attaches as soon
as a Supabase session exists (also listening on `onAuthStateChange`, so a
boot-time anonymous sign-in lands it without a reload). The attach result
is awaited and only marked bound on `ok` — a failed first pull retries in
30s instead of leaving sync silently dead. One frame owning the adapter
is enough: BroadcastChannel delivers remote merges to every other frame
on the origin.

## Honest limits

- Last-writer-wins on whole entities, per key. Field-level merge is
  deliberately out — conflicts surface via `sync.status().error`, not
  silently.
- Events/links don't sync (entities only) — the journal stays local per
  origin; events are derivable from entity history if needed later.
- The retry queue is best-effort, not transactional: it bounds the gap to
  one poll interval (plus adapter-name persistence), not a guaranteed
  delivery ledger.
- Tombstones are rows — they accrue forever. A periodic purge job
  (`deletedAt` older than the longest plausible offline gap) is the real
  fix if the table grows.
- Ownership is per anonymous-auth uid; signing into a different account
  syncs a different row set.
