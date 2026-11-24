-- Margin document sync: decks, quizzes, settings and per-note version
-- snapshots ride a generic per-user JSON doc store so every piece of
-- Study Materials data has a Supabase home, not just notes.
--
-- The /api/margin-docs routes use the service-role key, which bypasses
-- RLS — these policies only close direct anon-key access (the anon key is
-- public by design). Rows are scoped to user_id = auth.uid().

create table if not exists margin_docs (
    user_id    text        not null,
    doc_key    text        not null,
    payload    jsonb       not null,
    updated_at timestamptz not null default now(),
    primary key (user_id, doc_key)
);

alter table margin_docs enable row level security;

drop policy if exists margin_docs_owner on margin_docs;
create policy margin_docs_owner on margin_docs for all
    using (user_id = auth.uid()::text)
    with check (user_id = auth.uid()::text);
