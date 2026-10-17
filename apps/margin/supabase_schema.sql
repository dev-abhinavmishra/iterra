-- Supabase schema for Margin.
-- Run this in the Supabase SQL editor if you want cloud sync + durable usage limits.
-- The app works without Supabase (local IndexedDB + in-memory limits) too.
--
-- IMPORTANT: cloud sync requires Authentication → Providers → Anonymous
-- sign-ins to be enabled. /api/* verifies the anonymous JWT and scopes every
-- row to its owner — without it the endpoints answer 401 and data stays local.
-- Also enable hCaptcha under Authentication → Protection: anonymous sign-in
-- mints a fresh uid on demand. The API additionally charges anonymous-auth
-- callers against a daily IP counter, so rotation can't outrun the monthly
-- user_limits quota — but captcha still gates the account minting itself and
-- is the right first line of defense.

-- Notes (cloud mirror of the local library)
create table if not exists notes (
    id            text primary key,
    title         text,
    date          text,
    duration      text,
    content       text,
    transcript    text,
    type          text,
    tags          jsonb,
    attachments   jsonb,
    is_bookmarked boolean default false,
    last_accessed timestamptz,
    source_data   jsonb,
    user_id       text,          -- owner auth uid; the API sets it server-side
    updated_at    timestamptz default now()
);
alter table notes add column if not exists user_id text;
create index if not exists notes_user_idx on notes (user_id);

-- Saved Global Analysis sessions
create table if not exists analysis_sessions (
    id         uuid primary key default gen_random_uuid(),
    title      text,
    messages   jsonb,
    user_id    text,             -- owner auth uid; the API sets it server-side
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);
alter table analysis_sessions add column if not exists user_id text;
create index if not exists analysis_sessions_user_idx on analysis_sessions (user_id);

-- ── Row-level security ──────────────────────────────────────────────────────
-- The /api routes use the service-role key, which bypasses RLS — but these
-- tables should still be closed to direct anon-key access (the anon key is
-- public by design). Policies scope direct access to the row owner; rows
-- written before user_id existed (NULL) are invisible to everyone until the
-- owner claims them:
--   update notes set user_id = '<your auth uid>' where user_id is null;
--   update analysis_sessions set user_id = '<your auth uid>' where user_id is null;
alter table notes enable row level security;
alter table analysis_sessions enable row level security;

drop policy if exists notes_owner on notes;
create policy notes_owner on notes for all
    using (user_id = auth.uid()::text)
    with check (user_id = auth.uid()::text);

drop policy if exists sessions_owner on analysis_sessions;
create policy sessions_owner on analysis_sessions for all
    using (user_id = auth.uid()::text)
    with check (user_id = auth.uid()::text);

-- ── iterra canonical-store mirror (docs/SYNC.md) ────────────────────────────
-- Whole-store sync target for margin's sync adapter. Owned rows: (user_id,
-- key) is the identity — 'app:type:id' keys collide across accounts, so the
-- primary key is composite. RLS scopes each user to their own rows; the
-- client reads/writes through the anon key with the anonymous-auth session.
--
-- "courseId"/"updatedAt" are QUOTED camelCase — the columns must carry those
-- exact names: the client queries/upserts them by entity field name, and
-- Postgres folds unquoted identifiers to lowercase (postgREST then reports
-- 'column iterra_entities.updatedAt does not exist' on every call).
--
-- UPGRADING? If you created this table from the pre-ownership sketch in
-- docs/SYNC.md (single-column `key` PK, no user_id), the PK can't be altered
-- in place — drop and re-create:
--   drop table iterra_entities;
-- Any rows there are unowned (user_id is null) and unreachable under the RLS
-- policy below — nothing is lost but dead mirror rows. A table that already
-- HAS the composite PK just needs the ALTER/CREATE statements below — they
-- are all idempotent.
create table if not exists iterra_entities (
    user_id      text not null,
    key          text not null,             -- 'app:type:id'
    app          text not null,
    type         text not null,
    "courseId"   text,
    "updatedAt"  bigint not null,           -- WRITER's edit stamp — merge LWW only
    deleted      boolean not null default false,  -- tombstone: remote deletes
    "deletedAt"  bigint,                    --   propagate to peers via pull
    synced_at    timestamptz not null default now(),  -- SERVER stamp — pull filter
    body         jsonb not null,            -- the whole entity
    primary key (user_id, key)
);
-- In-place upgrades (the add-column forms are no-ops on a fresh create):
alter table iterra_entities add column if not exists deleted boolean not null default false;
alter table iterra_entities add column if not exists "deletedAt" bigint;
alter table iterra_entities add column if not exists synced_at timestamptz not null default now();

-- synced_at MUST be database-stamped, never client-sent: delta pulls filter
-- on it against a checkpoint in the same server-clock domain. A writer-side
-- stamp (client clock, retry-queue delay, skewed device) can land older than
-- the checkpoint and stay invisible to every peer forever — the exact bug
-- this column exists to prevent. The trigger restamps it on every write.
-- The same trigger enforces tombstone LWW server-side: a queued/replayed put
-- carrying an updatedAt at-or-before the row's deletedAt cannot resurrect it
-- (RETURN OLD skips the write) — a fresher edit can.
create or replace function iterra_entities_touch() returns trigger
language plpgsql as $$
begin
    if tg_op = 'UPDATE'
       and old.deleted and not new.deleted
       and new."updatedAt" <= coalesce(old."deletedAt", -1) then
        return old;
    end if;
    new.synced_at = now();
    return new;
end $$;
drop trigger if exists iterra_entities_touch on iterra_entities;
create trigger iterra_entities_touch before insert or update on iterra_entities
    for each row execute function iterra_entities_touch();

drop index if exists iterra_entities_pull_idx;
create index if not exists iterra_entities_pull_idx on iterra_entities (user_id, synced_at);

alter table iterra_entities enable row level security;
drop policy if exists iterra_entities_owner on iterra_entities;
create policy iterra_entities_owner on iterra_entities for all
    using (user_id = auth.uid()::text)
    with check (user_id = auth.uid()::text);

-- Daily free-usage counters (the enforcement layer for the anonymous daily limit).
-- Keyed by counter id + UTC day. Counter ids encode the bucket: bare anon ids
-- for the main quota, '<bucket>:<id>' for endpoint buckets, 'ip:<bucket>:<ip>'
-- for the anonymous IP pin that stops header-rotation from minting buckets.
create table if not exists usage_counters (
    user_id text not null,
    day     date not null,
    count   integer not null default 0,
    primary key (user_id, day)
);
-- RLS with no policies = deny-all for direct table access. Only the
-- service-role backend (which bypasses RLS) may touch this table — and only
-- ever through the RPC functions below.
alter table usage_counters enable row level security;

-- ── Quota functions (v2) ──────────────────────────────────────────────────────
-- Atomic reservation + refund for the free-usage counter. Consume increments
-- only while the caller is under the limit (a single conditional UPDATE —
-- concurrent calls can't race past it). Refund hands a reserved use back when
-- the AI call fails.

create or replace function consume_daily_usage(p_user_id text, p_day date, p_limit int)
returns integer language plpgsql as $$
declare new_count integer;
begin
    insert into usage_counters (user_id, day, count)
    values (p_user_id, p_day, 1)
    on conflict (user_id, day) do update
        set count = usage_counters.count + 1
        where usage_counters.count < p_limit
    returning count into new_count;

    if new_count is null then
        -- Row exists but is already at the limit: return -(count) so the
        -- caller can report accurate usage while seeing the deny.
        select count into new_count from usage_counters
        where user_id = p_user_id and day = p_day;
        return -coalesce(new_count, 0);
    end if;
    return new_count;
end $$;

create or replace function refund_daily_usage(p_user_id text, p_day date)
returns integer language plpgsql as $$
declare new_count integer;
begin
    update usage_counters
    set count = greatest(count - 1, 0)
    where user_id = p_user_id and day = p_day
    returning count into new_count;
    return coalesce(new_count, 0);
end $$;

-- ── EXECUTE lock-down ─────────────────────────────────────────────────────
-- These functions run as security INVOKER (the default), so a call under the
-- public anon key already dies inside them on the deny-all RLS. Even so,
-- don't leave them callable by the public roles at all: only the
-- service-role backend is a legitimate caller.
revoke execute on function consume_daily_usage(text, date, integer) from public, anon, authenticated;
revoke execute on function refund_daily_usage(text, date) from public, anon, authenticated;
grant execute on function consume_daily_usage(text, date, integer) to service_role;
grant execute on function refund_daily_usage(text, date) to service_role;

-- ── Quota functions for the AUTHENTICATED path ─────────────────────────────
-- `increment_usage` / `get_user_limits` against your `user_limits` table were
-- created before this file; `decrement_usage` mirrors increment_usage to refund
-- a reserved use after a failed AI call:
create or replace function public.decrement_usage(p_user_id uuid, p_requests integer default 1, p_tokens bigint default 0)
returns void language plpgsql security definer as $$
begin
  update public.user_limits
  set requests_used = greatest(0, requests_used - p_requests),
      tokens_used   = greatest(0::bigint, tokens_used - p_tokens),
      updated_at    = now()
  where user_id = p_user_id;
end $$;

-- CRITICAL: decrement_usage runs as DEFINER — left on the default public
-- EXECUTE grant it would be a free quota-refill RPC for anyone holding the
-- publishable anon key (`rpc('decrement_usage', {p_user_id: <my uid>})`).
-- Lock it to the service role, which is the only legitimate caller.
revoke execute on function public.decrement_usage(uuid, integer, bigint) from public, anon, authenticated;
grant execute on function public.decrement_usage(uuid, integer, bigint) to service_role;

-- The pre-existing `increment_usage` / `get_user_limits` are typically
-- security definer as well — on the default public EXECUTE grant any
-- anon-key caller could burn (or refill) ARBITRARY uids' monthly quota.
-- Their deployed signatures vary by project, so revoke on every public
-- overload: oid::regprocedure renders each function's full signature,
-- making this idempotent and signature-agnostic.
do $$
declare r record;
begin
    for r in
        select p.oid::regprocedure as sig
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('increment_usage', 'get_user_limits')
    loop
        execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
        execute format('grant execute on function %s to service_role', r.sig);
    end loop;
end $$;

-- Live note: the deployed `increment_usage` was also patched to lock its row
-- (`select ... for update`) so concurrent calls can't race past requests_cap.
