-- Listener schema, Phase 2. Run once as the database owner (SQL editor or
-- `npm run db:migrate`). Then give the app role a password:
--   alter role listener_app password '<long random password>';
-- and use that role in DATABASE_URL. The app role cannot bypass row level
-- security, so every query only sees the client named in app.client_id.
--
-- Everything lives in the private "listener" schema. Hosted Postgres
-- providers that publish a REST API (Supabase) expose only "public", and
-- their built in roles get no access here.

begin;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'listener_app') then
    create role listener_app login nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
end $$;

create schema listener;
revoke all on schema listener from public;
grant usage on schema listener to listener_app;
set local search_path = listener;

create table if not exists schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

-- Request scope, set per transaction by the data access layer.
create or replace function app_client() returns uuid
  language sql stable as $$ select nullif(current_setting('app.client_id', true), '')::uuid $$;
create or replace function app_scope() returns text
  language sql stable as $$ select coalesce(nullif(current_setting('app.scope', true), ''), 'client') $$;

create table clients (
  id uuid primary key,
  name_enc text not null,
  wrapped_dek text not null,
  created_at timestamptz not null default now()
);

create table projects (
  id uuid primary key,
  client_id uuid not null references clients (id) on delete cascade,
  name_enc text not null,
  brief_enc text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  unique (id, client_id)
);

create table meetings (
  id uuid primary key,
  client_id uuid not null,
  project_id uuid not null,
  template text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  speaker_map_enc text,
  unique (id, client_id),
  foreign key (project_id, client_id) references projects (id, client_id) on delete cascade
);

create table transcript_segments (
  id uuid primary key,
  client_id uuid not null,
  meeting_id uuid not null,
  seq integer not null check (seq >= 0),
  speaker integer check (speaker >= 0),
  start_ms integer not null check (start_ms >= 0),
  end_ms integer not null check (end_ms >= start_ms),
  text_enc text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (meeting_id, seq),
  foreign key (meeting_id, client_id) references meetings (id, client_id) on delete cascade
);

create table passkeys (
  id text primary key,
  public_key bytea not null,
  counter bigint not null default 0,
  transports text[] not null default '{}',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

-- Ids, event names, and counts only. Never content (SPEC 6.5).
create table audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  event text not null check (event ~ '^[a-z_.]{1,64}$'),
  client_id uuid,
  object_id uuid,
  count integer
);

create index projects_client_idx on projects (client_id);
create index meetings_client_project_idx on meetings (client_id, project_id, started_at desc);
create index segments_client_meeting_idx on transcript_segments (client_id, meeting_id, seq);
create index segments_expires_idx on transcript_segments (expires_at);
create index audit_at_idx on audit_log (at);

-- Row level security. FORCE applies it to the table owner too.
alter table clients enable row level security;
alter table clients force row level security;
alter table projects enable row level security;
alter table projects force row level security;
alter table meetings enable row level security;
alter table meetings force row level security;
alter table transcript_segments enable row level security;
alter table transcript_segments force row level security;
alter table passkeys enable row level security;
alter table passkeys force row level security;
alter table audit_log enable row level security;
alter table audit_log force row level security;

-- One client at a time. The directory scope may list clients and projects
-- (encrypted names and wrapped keys only) for the picker (SPEC 6.3).
create policy clients_scoped on clients
  to listener_app
  using (id = app_client()) with check (id = app_client());
create policy clients_directory on clients for select to listener_app
  using (app_scope() = 'directory');

create policy projects_scoped on projects
  to listener_app
  using (client_id = app_client()) with check (client_id = app_client());
create policy projects_directory on projects for select to listener_app
  using (app_scope() = 'directory');

create policy meetings_scoped on meetings
  to listener_app
  using (client_id = app_client()) with check (client_id = app_client());

create policy segments_scoped on transcript_segments
  to listener_app
  using (client_id = app_client()) with check (client_id = app_client());

create policy passkeys_auth on passkeys
  to listener_app
  using (app_scope() = 'auth') with check (app_scope() = 'auth');

create policy audit_insert on audit_log for insert to listener_app with check (true);

-- The app role gets data access only. No DDL, no truncate, no audit reads.
revoke all on all tables in schema listener from public;
revoke all on all functions in schema listener from public;
grant select, insert, update, delete on clients, projects, meetings, transcript_segments, passkeys to listener_app;
grant insert on audit_log to listener_app;
grant usage on sequence audit_log_id_seq to listener_app;
grant execute on function app_client(), app_scope() to listener_app;

-- Daily purge (SPEC 5). Runs with the owner's rights so it can delete across
-- clients, but it can only delete expired transcript rows and old audit rows.
create or replace function purge_expired(audit_days integer) returns integer
  language plpgsql security definer set search_path = listener as $$
declare
  removed integer;
begin
  delete from transcript_segments where expires_at <= now();
  get diagnostics removed = row_count;
  delete from audit_log where at < now() - make_interval(days => audit_days);
  insert into audit_log (event, count) values ('purge.segments', removed);
  return removed;
end $$;
revoke all on function purge_expired(integer) from public;
grant execute on function purge_expired(integer) to listener_app;

insert into schema_migrations (version) values ('0001_init');

commit;
