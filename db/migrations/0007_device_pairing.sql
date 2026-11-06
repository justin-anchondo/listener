-- Listener: sign in on a computer by approving it from the phone (SPEC 6.1).
-- Run once as the database owner, after 0006_live_follow. Every name is
-- schema qualified.
--
-- A computer asks to sign in and shows a short code. The signed in phone
-- approves that code with a fresh Face ID check. The computer then claims a
-- session with a secret only it holds (stored here as a hash). Requests
-- expire within minutes, work once, and the daily purge removes old ones.
-- Readable only in the auth scope, like passkeys.

begin;

create table listener.pairings (
  id uuid primary key,
  code text not null check (code ~ '^[A-Z2-9]{8}$'),
  claim_hash text not null,
  device text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  approved_at timestamptz,
  claimed_at timestamptz
);

create index pairings_code_idx on listener.pairings (code, expires_at);

alter table listener.pairings enable row level security;
alter table listener.pairings force row level security;

create policy pairings_auth on listener.pairings to listener_app
  using (listener.app_scope() = 'auth') with check (listener.app_scope() = 'auth');

revoke all on listener.pairings from public;
grant select, insert on listener.pairings to listener_app;
grant update (approved_at, claimed_at) on listener.pairings to listener_app;

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
  delete from listener.audit_log where at < now() - make_interval(days => audit_days);
  insert into listener.audit_log (event, count) values ('purge.segments', removed);
  insert into listener.audit_log (event, count) values ('purge.suggestions', cards);
  return removed;
end $$;
revoke all on function listener.purge_expired(integer) from public;
grant execute on function listener.purge_expired(integer) to listener_app;

insert into listener.schema_migrations (version) values ('0007_device_pairing');

commit;
