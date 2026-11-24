# Sync — opt-in remote mirror for the canonical store

The canonical entity store is local-first (IndexedDB, LS fallback).
`iterra.sync.attach(adapter)` adds an optional remote mirror for canonical
shared records. Private app databases, events, and links are not included.
Sync is off by default and attaches only after the user opts in from Settings.

## Interface (implemented in the hub)

```js
adapter = {
  name: 'supabase',
  pull: (since) => Promise<Entity[] | {rows: Entity[], watermark: number}>,
  put: (entity) => Promise<void | {status:'applied'|'stale', remote?:Entity}>,
  remove: (key, deletedAt) => Promise<void | {status:'applied'|'stale', remote?:Entity}>,
  onConflict: (local, remote) => remote // optional resolver — `local` is the real local copy or null
}
iterra.sync.attach(adapter)           // one at a time; attach again replaces
iterra.sync.attach(adapter, {pollMs}) // optional re-pull cadence (default 60s)
iterra.sync.status()                  // consent, provider, identity pause, and transfer state
iterra.sync.setEnabled(true|false)    // persists explicit user consent
iterra.sync.detach(reason)            // preserves this adapter's retry queue
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

After opt-in, attach pulls once, then re-pulls every 60s on the checkpoint.
Every tenth pull is a full scan from epoch to repair rows missed by delayed
transactions or cursor movement. A failed pull does not advance the
checkpoint; the next tick retries. Full scans are eventually corrective, not
an immediate delivery guarantee.

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

## Ownership and implementation

The table, owner policy, grants, and atomic RPC contracts are defined in
`supabase/migrations/20261122040424_create_iterra_entities_sync.sql`.
Authenticated clients read through owner-scoped RLS and write only through
`iterra_entity_put` / `iterra_entity_remove`. A stale RPC response is followed
by an exact owner-and-key read so the hub can reconcile the winning row.

The shell's sync bootstrap listens for opt-in and auth changes without loading
Margin. Supabase's client and auth code are dynamically loaded only when sync
has already been enabled or the user explicitly opts in. Anonymous auth starts
only after that consent. The listener defers Supabase calls until after
`onAuthStateChange` returns, serializes attach attempts, and detaches on
sign-out. Pull pages use a `(synced_at,key)` keyset cursor and a fixed upper
bound captured at the start of each pull; every tenth pull is a full scan from
epoch. This avoids offset shifts when rows move during a large pull and
periodically repairs delayed-commit gaps.

The adapter persists a local owner marker only after explicit opt-in. A
different identity pauses sync and does not move the marker, local rows, or
retry queue. Settings can link an email to the anonymous identity while retaining its uid. On a new browser, sign in to the linked account before enabling sync.

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
- Ownership is per auth uid; a different uid is paused instead of
  attaching to the same local canonical store. No automatic migration or
  merge is offered.
