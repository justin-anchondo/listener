-- Listener: learn from what the owner keeps and removes (tasks and live
-- tips). Run once as the database owner, after 0007_device_pairing. Every
-- name is schema qualified.
--
-- feedback rows are per client: the task or tip text (encrypted with the
-- client's key), what happened to it, and an optional one-tap reason. Prompts
-- for a client use that client's rows only. General habits across clients
-- come from feedback_reason_counts, which returns counts of reasons and
-- never any text. Rows expire (tips with the transcript, tasks later) and
-- the daily purge removes them.

begin;

create table listener.feedback (
  id uuid primary key,
  client_id uuid not null references listener.clients (id) on delete cascade,
  kind text not null check (kind in ('task', 'tip')),
  source_id uuid not null, -- the task or tip it was about (no foreign key: the task may be deleted)
  signal text not null check (signal in ('removed', 'completed', 'edited', 'pinned')),
  reason text check (reason in ('not_mine', 'not_a_task', 'too_vague', 'duplicate', 'already_known', 'not_useful', 'wrong', 'other')),
  text_enc text,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null
);

create index feedback_client_idx on listener.feedback (client_id, kind, created_at desc);
create index feedback_source_idx on listener.feedback (source_id);
create index feedback_expires_idx on listener.feedback (expires_at);

alter table listener.feedback enable row level security;
alter table listener.feedback force row level security;

create policy feedback_scoped on listener.feedback to listener_app
  using (client_id = listener.app_client()) with check (client_id = listener.app_client());

revoke all on listener.feedback from public;
grant select, insert, delete on listener.feedback to listener_app;

-- Reason counts across clients for one kind: numbers only, no text, no ids.
create function listener.feedback_reason_counts(p_kind text)
  returns table (signal text, reason text, n integer)
  language sql stable security definer set search_path = listener, pg_temp as $$
    select f.signal, f.reason, count(*)::int
    from listener.feedback f
    where f.kind = p_kind and f.expires_at > now()
    group by f.signal, f.reason
$$;
revoke all on function listener.feedback_reason_counts(text) from public;
grant execute on function listener.feedback_reason_counts(text) to listener_app;

create or replace function listener.purge_expired(audit_days integer) returns integer
  language plpgsql security definer set search_path = listener, pg_temp as $$
declare
  removed integer;
  cards integer;
begin
  delete from listener.transcript_segments where expires_at <= now();
  get diagnostics removed = row_count;
  delete from listener.suggestions where expires_at is not null and expires_at <= now();
  get diagnostics cards = row_count;
  delete from listener.pairings where expires_at < now() - interval '1 day';
  delete from listener.feedback where expires_at <= now();
  delete from listener.audit_log where at < now() - make_interval(days => audit_days);
  insert into listener.audit_log (event, count) values ('purge.segments', removed);
  insert into listener.audit_log (event, count) values ('purge.suggestions', cards);
  return removed;
end $$;
revoke all on function listener.purge_expired(integer) from public;
grant execute on function listener.purge_expired(integer) to listener_app;

insert into listener.schema_migrations (version) values ('0008_learning');

commit;
