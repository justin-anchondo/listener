-- Listener: project brief amendments. Run once as the database owner, after
-- 0002_summaries. Every name is schema qualified.
--
-- The owner writes the original brief (projects.brief_enc). After each
-- meeting the model may add dated amendments; the owner can add notes too.
-- Amendment text can never be changed by the app: it can only be added,
-- dismissed, or restored (dismissed_at), so the history stays intact.

begin;

create table listener.brief_amendments (
  id uuid primary key,
  client_id uuid not null,
  project_id uuid not null,
  meeting_id uuid,
  source text not null check (source in ('meeting', 'owner')),
  text_enc text not null,
  created_at timestamptz not null default clock_timestamp(),
  dismissed_at timestamptz,
  foreign key (project_id, client_id) references listener.projects (id, client_id) on delete cascade,
  foreign key (meeting_id, client_id) references listener.meetings (id, client_id) on delete cascade,
  check ((source = 'meeting') = (meeting_id is not null))
);

create index brief_amendments_project_idx on listener.brief_amendments (client_id, project_id, created_at);

alter table listener.brief_amendments enable row level security;
alter table listener.brief_amendments force row level security;

create policy brief_amendments_scoped on listener.brief_amendments to listener_app
  using (client_id = listener.app_client()) with check (client_id = listener.app_client());

revoke all on listener.brief_amendments from public;
grant select, insert on listener.brief_amendments to listener_app;
-- Only the dismissed flag can change. Regenerating a summary may remove that
-- meeting's not yet dismissed amendments before adding the new ones.
grant update (dismissed_at) on listener.brief_amendments to listener_app;
grant delete on listener.brief_amendments to listener_app;

insert into listener.schema_migrations (version) values ('0003_brief_amendments');

commit;
