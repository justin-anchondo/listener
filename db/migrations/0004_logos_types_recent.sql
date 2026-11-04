-- Listener: client logos, editable meeting types, and the recent meetings
-- list. Run once as the database owner, after 0003. Every name is schema
-- qualified.

begin;

-- Client logo: a small image, encrypted with the client's key like its name.
alter table listener.clients add column logo_enc text;
alter table listener.clients add column logo_updated_at timestamptz;

-- Meeting types the owner can edit (name and what the assistant watches for).
-- Not client data. Archived instead of deleted, so old meetings keep their type.
create table listener.meeting_types (
  id uuid primary key,
  key text not null unique check (key ~ '^[a-z0-9_]{1,40}$'),
  name text not null check (length(name) between 1 and 60),
  watch_for text[] not null default '{}',
  position integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

alter table listener.meeting_types enable row level security;
alter table listener.meeting_types force row level security;
create policy meeting_types_settings on listener.meeting_types to listener_app
  using (listener.app_scope() = 'settings') with check (listener.app_scope() = 'settings');
revoke all on listener.meeting_types from public;
grant select, insert, update on listener.meeting_types to listener_app;

-- Recent meetings across clients (SPEC 6.3, CLAUDE.md rule 3): meeting rows
-- and their summaries, read only, for the Meetings tab. Display only; never
-- sent to a model.
create policy meetings_recent on listener.meetings for select to listener_app
  using (listener.app_scope() = 'recent');
create policy summaries_recent on listener.summaries for select to listener_app
  using (listener.app_scope() = 'recent');

insert into listener.schema_migrations (version) values ('0004_logos_types_recent');

commit;
