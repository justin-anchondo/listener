-- Listener Phase 3: meeting summaries and action items. Run once as the
-- database owner, after 0001_init. Every name is schema qualified so the
-- script behaves the same in any SQL editor.

begin;

-- Summaries are append only: each generation or edit is a new version
-- (SPEC 4.3). The app role can insert and read, never update or delete.
-- Deleting a meeting or client still removes them through the cascade.
create table listener.summaries (
  id uuid primary key,
  client_id uuid not null,
  meeting_id uuid not null,
  version integer not null check (version >= 1),
  source text not null check (source in ('model', 'edit')),
  model text,
  content_enc text not null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (meeting_id, version),
  foreign key (meeting_id, client_id) references listener.meetings (id, client_id) on delete cascade
);

create table listener.action_items (
  id uuid primary key,
  client_id uuid not null,
  project_id uuid not null,
  meeting_id uuid,
  title_enc text not null,
  owner_enc text,
  due_date date,
  status text not null default 'open' check (status in ('open', 'done')),
  snoozed_until date,
  source_quote_enc text,
  source_ms integer check (source_ms >= 0),
  edited boolean not null default false,
  -- clock_timestamp keeps items in the order they were inserted within one transaction.
  created_at timestamptz not null default clock_timestamp(),
  closed_at timestamptz,
  foreign key (project_id, client_id) references listener.projects (id, client_id) on delete cascade,
  foreign key (meeting_id, client_id) references listener.meetings (id, client_id) on delete cascade
);

create index summaries_meeting_idx on listener.summaries (client_id, meeting_id, version desc);
create index action_items_client_idx on listener.action_items (client_id, status, due_date);
create index action_items_meeting_idx on listener.action_items (client_id, meeting_id);

alter table listener.summaries enable row level security;
alter table listener.summaries force row level security;
alter table listener.action_items enable row level security;
alter table listener.action_items force row level security;

create policy summaries_scoped on listener.summaries to listener_app
  using (client_id = listener.app_client()) with check (client_id = listener.app_client());

create policy action_items_scoped on listener.action_items to listener_app
  using (client_id = listener.app_client()) with check (client_id = listener.app_client());

-- The consolidated open items view (SPEC 7, CLAUDE.md rule 3) may read
-- action items across clients, and nothing else in this scope.
create policy action_items_open_items on listener.action_items for select to listener_app
  using (listener.app_scope() = 'open_items');

revoke all on listener.summaries, listener.action_items from public;
grant select, insert on listener.summaries to listener_app;
grant select, insert, update, delete on listener.action_items to listener_app;

insert into listener.schema_migrations (version) values ('0002_summaries');

commit;
