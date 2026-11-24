-- Canonical Iterra entity mirror. This is intentionally separate from
-- Margin's notes/session API and quota tables; the app's shared sync adapter
-- owns only complete hub entities.
begin;

-- JavaScript String.length counts UTF-16 code units; PostgreSQL char_length
-- counts Unicode code points. This keeps the hub's 200-unit ID bound exact.
create function public.iterra_js_utf16_length(p_value text)
returns integer
language sql
immutable
strict
set search_path = ''
as $function$
  select char_length(p_value)::integer + coalesce(sum(
    case when ascii(substr(p_value, i, 1)) > 65535 then 1 else 0 end
  ), 0)::integer
  from generate_series(1, char_length(p_value)) as chars(i)
$function$;

create table public.iterra_entities (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  app text not null,
  type text not null,
  "courseId" text,
  "updatedAt" bigint not null,
  deleted boolean not null default false,
  "deletedAt" bigint,
  -- Server arrival stamp used only for incremental pull checkpoints. It is
  -- kept separate from the hub's writer-clock LWW fields above.
  synced_at timestamptz not null default clock_timestamp(),
  body jsonb not null,
  constraint iterra_entities_owner_key primary key (user_id, key),
  constraint iterra_entities_identity check (
    app ~ '^[a-z]+$' and
    type in (
      'course', 'term', 'assignment', 'source', 'note', 'card', 'deck', 'quiz',
      'problem', 'attempt', 'session', 'goal', 'grade', 'routine', 'experiment',
      'assessment', 'block', 'commitment', 'link', 'event', 'scan', 'entry',
      'topic', 'material', 'followup', 'task', 'workflow'
    ) and
    body ->> 'id' is not null and
    public.iterra_js_utf16_length(body ->> 'id') between 1 and 200 and
    key = app || ':' || type || ':' || (body ->> 'id')
  ),
  constraint iterra_entities_body_shape check (
    jsonb_typeof(body) = 'object' and
    body ->> 'key' is not null and
    body ->> 'app' is not null and
    body ->> 'type' is not null and
    body ->> 'updatedAt' is not null and
    body ->> 'key' = key and
    body ->> 'app' = app and
    body ->> 'type' = type and
    jsonb_typeof(body -> 'updatedAt') = 'number' and
    body ->> 'updatedAt' = "updatedAt"::text and
    jsonb_typeof(body -> 'id') = 'string' and
    (not (body ? 'courseId') or body -> 'courseId' = 'null'::jsonb or jsonb_typeof(body -> 'courseId') = 'string') and
    (not (body ? 'course') or body -> 'course' = 'null'::jsonb or jsonb_typeof(body -> 'course') = 'string') and
    (not (body ? 'topic') or body -> 'topic' = 'null'::jsonb or jsonb_typeof(body -> 'topic') = 'string') and
    (not (body ? 'title') or body -> 'title' = 'null'::jsonb or jsonb_typeof(body -> 'title') = 'string') and
    (not (body ? 'sub') or body -> 'sub' = 'null'::jsonb or jsonb_typeof(body -> 'sub') = 'string') and
    (not (body ? 'url') or body -> 'url' = 'null'::jsonb or jsonb_typeof(body -> 'url') = 'string') and
    (not (body ? 'lang') or body -> 'lang' = 'null'::jsonb or jsonb_typeof(body -> 'lang') = 'string') and
    (body ->> 'courseId') is not distinct from "courseId"
  ),
  constraint iterra_entities_tombstone_shape check (
    (deleted and "deletedAt" is not null) or
    (not deleted and "deletedAt" is null)
  )
);

-- Matches the adapter's owner filter, server-stamp range scan and stable
-- synced_at/key ordering for pagination.
create index iterra_entities_pull_idx
  on public.iterra_entities (user_id, synced_at, key);

alter table public.iterra_entities enable row level security;
create policy iterra_entities_owner
  on public.iterra_entities
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- RLS is the row boundary; grants are the Data API object boundary. No
-- anonymous-key role gets direct table access or hard DELETE permission.
grant usage on schema public to authenticated;
revoke all privileges on table public.iterra_entities from public, anon, authenticated;
grant select on table public.iterra_entities to authenticated;

-- Stamp successful writes only. Stale writes never reach this trigger because
-- the RPC's ON CONFLICT predicate rejects them before an UPDATE is performed.
-- This records server arrival time for paging; it is not the commit timestamp.
create function public.iterra_entities_touch()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  new.synced_at = clock_timestamp();
  return new;
end;
$function$;

create trigger iterra_entities_touch
  before insert or update on public.iterra_entities
  for each row execute function public.iterra_entities_touch();

-- Use SECURITY DEFINER because authenticated clients receive no table DML
-- grants. The owner is always derived from auth.uid(); callers cannot nominate
-- another user_id. `stale` means a newer live edit or
-- tombstone already won, and causes the client to fetch and reconcile that
-- exact owner-scoped row rather than retrying a stale snapshot forever.
-- Equal live timestamps are accepted: the hub's existing deterministic
-- canonical-body tie-break repairs any transient arrival-order divergence on
-- the next successful pull.
create function public.iterra_entity_put(
  p_key text,
  p_app text,
  p_type text,
  p_course_id text,
  p_updated_at bigint,
  p_body jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_owner uuid := (select auth.uid());
  v_body jsonb;
begin
  if v_owner is null then
    raise exception using errcode = '28000', message = 'Authentication is required to sync Iterra entities.';
  end if;
  if p_key = '' or p_app = '' or p_type = '' or
     strpos(p_app, ':') > 0 or strpos(p_type, ':') > 0 or
     p_updated_at < 0 or p_updated_at > 9007199254740991 then
    raise exception using errcode = '22023', message = 'Invalid Iterra entity payload.';
  end if;
  if p_key is null or p_app is null or p_type is null or p_updated_at is null or
     p_body is null or jsonb_typeof(p_body) <> 'object' or
     p_app !~ '^[a-z]+$' or
     p_type not in (
       'course', 'term', 'assignment', 'source', 'note', 'card', 'deck', 'quiz',
       'problem', 'attempt', 'session', 'goal', 'grade', 'routine', 'experiment',
       'assessment', 'block', 'commitment', 'link', 'event', 'scan', 'entry',
       'topic', 'material', 'followup', 'task', 'workflow'
     ) or
     p_body ->> 'key' is distinct from p_key or
     p_body ->> 'app' is distinct from p_app or
     p_body ->> 'type' is distinct from p_type or
     p_body ->> 'id' is null or
     jsonb_typeof(p_body -> 'id') <> 'string' or
     public.iterra_js_utf16_length(p_body ->> 'id') not between 1 and 200 or
     p_key is distinct from (p_app || ':' || p_type || ':' || (p_body ->> 'id')) or
     p_course_id is distinct from (p_body ->> 'courseId') then
    raise exception using errcode = '22023', message = 'Invalid Iterra entity payload.';
  end if;

  if exists (
       select 1 from jsonb_object_keys(p_body) as keys(name)
       where name not in (
         'key', 'id', 'type', 'app', 'courseId', 'course', 'topic',
         'title', 'sub', 'url', 'lang', 'data', 'createdAt', 'updatedAt', 'v'
       )
     ) or
     (p_body ? 'courseId' and p_body -> 'courseId' <> 'null'::jsonb and jsonb_typeof(p_body -> 'courseId') <> 'string') or
     (p_body ? 'course' and p_body -> 'course' <> 'null'::jsonb and jsonb_typeof(p_body -> 'course') <> 'string') or
     (p_body ? 'topic' and p_body -> 'topic' <> 'null'::jsonb and jsonb_typeof(p_body -> 'topic') <> 'string') or
     (p_body ? 'title' and p_body -> 'title' <> 'null'::jsonb and jsonb_typeof(p_body -> 'title') <> 'string') or
     (p_body ? 'sub' and p_body -> 'sub' <> 'null'::jsonb and jsonb_typeof(p_body -> 'sub') <> 'string') or
     (p_body ? 'url' and p_body -> 'url' <> 'null'::jsonb and jsonb_typeof(p_body -> 'url') <> 'string') or
     (p_body ? 'lang' and p_body -> 'lang' <> 'null'::jsonb and jsonb_typeof(p_body -> 'lang') <> 'string') or
     (p_body ? 'createdAt' and p_body -> 'createdAt' <> 'null'::jsonb and jsonb_typeof(p_body -> 'createdAt') <> 'number') or
     (p_body ? 'v' and p_body -> 'v' <> 'null'::jsonb and jsonb_typeof(p_body -> 'v') <> 'number') or (
    p_body ? 'data' and p_body -> 'data' <> 'null'::jsonb and
    public.iterra_js_utf16_length((p_body -> 'data')::text) > 65536
  ) then
    raise exception using errcode = '22023', message = 'Invalid Iterra entity payload.';
  end if;


  -- Match the indexed row stamp to the body even for legacy entities that
  -- reached the adapter before the hub supplied updatedAt on the body.
  v_body := jsonb_set(p_body, '{key}', to_jsonb(p_key), true);
  v_body := jsonb_set(v_body, '{updatedAt}', to_jsonb(p_updated_at), true);

  insert into public.iterra_entities as current_row (
    user_id, key, app, type, "courseId", "updatedAt", deleted, "deletedAt", body
  ) values (
    v_owner, p_key, p_app, p_type, p_course_id, p_updated_at, false, null, v_body
  )
  on conflict (user_id, key) do update set
    app = excluded.app,
    type = excluded.type,
    "courseId" = excluded."courseId",
    "updatedAt" = excluded."updatedAt",
    deleted = false,
    "deletedAt" = null,
    body = excluded.body
  where
    (not current_row.deleted and excluded."updatedAt" >= current_row."updatedAt") or
    (current_row.deleted and excluded."updatedAt" > coalesce(current_row."deletedAt", -1));

  if found then
    return 'applied';
  end if;
  return 'stale';
end;
$function$;

-- A remove creates a minimal tombstone even when the entity's original put
-- is still in flight. ON CONFLICT atomically compares the operation clock; a
-- stale delete returns `stale` without touching synced_at, so the client can
-- fetch the winner and apply the hub's existing LWW/CAS rules. Tombstones
-- contain only key/app/type/id and the delete stamp, not deleted user content.
create function public.iterra_entity_remove(
  p_key text,
  p_deleted_at bigint
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_owner uuid := (select auth.uid());
  v_app text;
  v_type text;
  v_id text;
  v_body jsonb;
begin
  if v_owner is null then
    raise exception using errcode = '28000', message = 'Authentication is required to sync Iterra entities.';
  end if;
  if p_key is null or p_key = '' or p_deleted_at is null or
     p_deleted_at < 0 or p_deleted_at > 9007199254740991 then
    raise exception using errcode = '22023', message = 'Invalid Iterra entity deletion.';
  end if;

  v_app := split_part(p_key, ':', 1);
  v_type := split_part(p_key, ':', 2);
  v_id := substring(p_key from char_length(v_app) + char_length(v_type) + 3);
  if v_app !~ '^[a-z]+$' or v_type not in (
       'course', 'term', 'assignment', 'source', 'note', 'card', 'deck', 'quiz',
       'problem', 'attempt', 'session', 'goal', 'grade', 'routine', 'experiment',
       'assessment', 'block', 'commitment', 'link', 'event', 'scan', 'entry',
       'topic', 'material', 'followup', 'task', 'workflow'
     ) or v_id = '' or public.iterra_js_utf16_length(v_id) > 200 then
    raise exception using errcode = '22023', message = 'Invalid canonical Iterra entity key.';
  end if;
  v_body := jsonb_build_object(
    'key', p_key, 'app', v_app, 'type', v_type, 'id', v_id, 'updatedAt', p_deleted_at
  );

  insert into public.iterra_entities as current_row (
    user_id, key, app, type, "courseId", "updatedAt", deleted, "deletedAt", body
  ) values (
    v_owner, p_key, v_app, v_type, null, p_deleted_at, true, p_deleted_at, v_body
  )
  on conflict (user_id, key) do update set
    "courseId" = null,
    "updatedAt" = excluded."updatedAt",
    deleted = true,
    "deletedAt" = excluded."deletedAt",
    body = excluded.body
  where
    (not current_row.deleted and excluded."deletedAt" >= current_row."updatedAt") or
    (current_row.deleted and excluded."deletedAt" >= coalesce(current_row."deletedAt", -1));

  if found then
    return 'applied';
  end if;
  return 'stale';
end;
$function$;

-- PostgreSQL grants EXECUTE to PUBLIC by default. These RPCs are reachable
-- only to authenticated sessions (including enabled anonymous sign-ins).
revoke all privileges on function public.iterra_entities_touch() from public, anon, authenticated;
revoke all privileges on function public.iterra_js_utf16_length(text) from public, anon, authenticated;
revoke all privileges on function public.iterra_entity_put(text, text, text, text, bigint, jsonb) from public, anon, authenticated;
revoke all privileges on function public.iterra_entity_remove(text, bigint) from public, anon, authenticated;
grant execute on function public.iterra_entity_put(text, text, text, text, bigint, jsonb) to authenticated;
grant execute on function public.iterra_entity_remove(text, bigint) to authenticated;

comment on table public.iterra_entities is
  'Owner-scoped, whole-entity Iterra mirror. Browser backups remain the portability path for anonymous local-first workspaces.';

commit;
