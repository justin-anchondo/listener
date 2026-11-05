-- Listener: follow a live meeting from a second screen. Run once as the
-- database owner, after 0005_live_suggestions. Every name is schema qualified.
--
-- live_tips records whether live tips are on for a meeting, so the phone
-- (which records) and a desktop (which follows) agree on it. Meetings
-- already carry update rights for the app role and select in the recent
-- scope, so no new grants or policies are needed.

begin;

alter table listener.meetings add column live_tips boolean not null default false;

insert into listener.schema_migrations (version) values ('0006_live_follow');

commit;
