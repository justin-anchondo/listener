-- Listener: a read-only connector for Claude (SPEC 6.6). Run once as the
-- database owner, after 0008_learning. Every name is schema qualified.
--
-- Claude registers itself (OAuth dynamic client registration), the owner
-- approves it on the phone with Face ID, and Claude gets short lived access
-- tokens plus a rotating refresh token. Only hashes of codes and tokens are
-- stored. Nothing here holds client data. Readable only in the connector
-- scope. The owner can revoke a connection at any time.

begin;

create table listener.oauth_clients (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{16,64}$'),
  name text not null check (length(name) between 1 and 100),
  redirect_uris text[] not null,
  created_at timestamptz not null default now()
);

create table listener.oauth_codes (
  code_hash text primary key,
  oauth_client_id text not null references listener.oauth_clients (id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create table listener.oauth_grants (
  id uuid primary key,
  oauth_client_id text not null references listener.oauth_clients (id) on delete cascade,
  access_hash text not null unique,
  refresh_hash text not null unique,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index oauth_grants_client_idx on listener.oauth_grants (oauth_client_id);

alter table listener.oauth_clients enable row level security;
alter table listener.oauth_clients force row level security;
alter table listener.oauth_codes enable row level security;
alter table listener.oauth_codes force row level security;
alter table listener.oauth_grants enable row level security;
alter table listener.oauth_grants force row level security;

create policy oauth_clients_connector on listener.oauth_clients to listener_app
  using (listener.app_scope() = 'connector') with check (listener.app_scope() = 'connector');
create policy oauth_codes_connector on listener.oauth_codes to listener_app
  using (listener.app_scope() = 'connector') with check (listener.app_scope() = 'connector');
create policy oauth_grants_connector on listener.oauth_grants to listener_app
  using (listener.app_scope() = 'connector') with check (listener.app_scope() = 'connector');

revoke all on listener.oauth_clients, listener.oauth_codes, listener.oauth_grants from public;
grant select, insert on listener.oauth_clients to listener_app;
grant select, insert on listener.oauth_codes to listener_app;
grant update (used_at) on listener.oauth_codes to listener_app;
grant select, insert on listener.oauth_grants to listener_app;
grant update (access_hash, refresh_hash, access_expires_at, last_used_at, revoked_at) on listener.oauth_grants to listener_app;

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
  delete from listener.oauth_codes where expires_at < now() - interval '1 day';
  delete from listener.oauth_grants where refresh_expires_at < now() or revoked_at < now() - interval '1 day';
  delete from listener.audit_log where at < now() - make_interval(days => audit_days);
  insert into listener.audit_log (event, count) values ('purge.segments', removed);
  insert into listener.audit_log (event, count) values ('purge.suggestions', cards);
  return removed;
end $$;
revoke all on function listener.purge_expired(integer) from public;
grant execute on function listener.purge_expired(integer) to listener_app;

insert into listener.schema_migrations (version) values ('0009_connector');

commit;
