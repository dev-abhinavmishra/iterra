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
  pull: (since) => Promise<Entity[]>,   // remote entities newer than `since` (updatedAt ms)
  put: (entity) => Promise<void>,       // called on every local put
  remove: (key) => Promise<void>,       // optional — called on removes
  onConflict: (local, remote) => remote // optional resolver
}
iterra.sync.attach(adapter)  // one at a time; attach again replaces
iterra.sync.status()         // {attached, adapter, attachedAt, lastPull, error}
```

Attach pulls remote rows newer than the newest local `updatedAt`, runs each
through `store.put` — so validation + quarantine apply to remote data too —
then mirrors every subsequent local put/remove outward.

## Table

```sql
create table if not exists iterra_entities (
  key        text primary key,          -- 'app:type:id'
  app        text not null,
  type       text not null,
  courseId   text,
  updatedAt  bigint not null,
  body       jsonb not null             -- the whole entity
);
create index on iterra_entities (updatedAt);
-- RLS: key per auth.users row if multi-user, or permissive for the
-- anonymous-auth path margin already uses.
```

## Adapter sketch (lives in margin's adapter file, shared code)

```ts
import { supabase } from '../services/supabaseClient';

export function attachItterraSync() {
  const it = (window as any).iterra;
  if (!it?.sync?.attach || !supabase) return;   // env absent → stay local
  it.sync.attach({
    name: 'supabase',
    pull: async (since) => {
      const { data, error } = await supabase
        .from('iterra_entities')
        .select('body')
        .gt('updatedAt', since);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.body);
    },
    put: async (e) => {
      await supabase.from('iterra_entities').upsert({
        key: e.key ?? `${e.app}:${e.type}:${e.id}`,
        app: e.app, type: e.type, courseId: e.courseId ?? null,
        updatedAt: e.updatedAt ?? Date.now(), body: e,
      });
    },
    remove: async (key) => {
      await supabase.from('iterra_entities').delete().eq('key', key);
    },
    onConflict: (_l, r) => r,           // last-writer-wins for the sketch
  });
}
```

Call `attachItterraSync()` once at margin boot (guarded — it no-ops with no
client). One frame owning the adapter is enough: BroadcastChannel delivers
remote merges to every other frame on the origin.

## Honest limits

- Last-writer-wins on whole entities. Field-level merge is deliberately out
  of the sketch — conflicts surface via `sync.status().error`, not silently.
- Events/links don't sync (entities only) — the journal stays local per
  origin; events are derivable from entity history if needed later.
- Anonymous auth keys the rows to margin's existing usage-counter path; a
  real multi-user pass needs auth.uid() ownership + RLS policies.
