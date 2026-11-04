-- Listener: live suggestion cards (SPEC 4.1, 5). Run once as the database
-- owner, after 0004_logos_types_recent. Every name is schema qualified.
--
-- Cards are encrypted with the client's key. Unpinned cards expire with the
-- meeting's transcript and the daily purge removes them; pinning clears
-- expires_at so the card stays with the summary.

begin;

create table listener.suggestions (
  id uuid primary key,
  client_id uuid not null,
  meeting_id uuid not null,
  kind text not null check (kind in ('talking_point', 'question', 'reminder', 'agenda')),
  text_enc text not null,
  source_ms integer check (source_ms >= 0),
  pinned boolean not null default false,
  dismissed boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (meeting_id, client_id) references listener.meetings (id, client_id) on delete cascade,
  check (pinned = (expires_at is null))
);

create index suggestions_meeting_idx on listener.suggestions (client_id, meeting_id, created_at);
create index suggestions_expires_idx on listener.suggestions (expires_at) where expires_at is not null;

alter table listener.suggestions enable row level security;
alter table listener.suggestions force row level security;

create policy suggestions_scoped on listener.suggestions to listener_app
  using (client_id = listener.app_client()) with check (client_id = listener.app_client());

revoke all on listener.suggestions from public;
grant select, insert, delete on listener.suggestions to listener_app;
grant update (pinned, dismissed, expires_at) on listener.suggestions to listener_app;

-- The purge now also removes expired, unpinned cards.
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
  delete from listener.audit_log where at < now() - make_interval(days => audit_days);
  insert into listener.audit_log (event, count) values ('purge.segments', removed);
  insert into listener.audit_log (event, count) values ('purge.suggestions', cards);
  return removed;
end $$;
revoke all on function listener.purge_expired(integer) from public;
grant execute on function listener.purge_expired(integer) to listener_app;

insert into listener.schema_migrations (version) values ('0005_live_suggestions');

commit;
