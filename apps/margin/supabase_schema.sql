-- Supabase schema for Margin.
-- Run this in the Supabase SQL editor if you want cloud sync + durable usage limits.
-- The app works without Supabase (local IndexedDB + in-memory limits) too.

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
    updated_at    timestamptz default now()
);

-- Saved Global Analysis sessions
create table if not exists analysis_sessions (
    id         uuid primary key default gen_random_uuid(),
    title      text,
    messages   jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Daily free-usage counters (the enforcement layer for the anonymous daily limit).
-- Keyed by an anonymous browser id (text) + UTC day — no authentication required.
create table if not exists usage_counters (
    user_id text not null,
    day     date not null,
    count   integer not null default 0,
    primary key (user_id, day)
);

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
-- Live note: the deployed `increment_usage` was also patched to lock its row
-- (`select ... for update`) so concurrent calls can't race past requests_cap.
