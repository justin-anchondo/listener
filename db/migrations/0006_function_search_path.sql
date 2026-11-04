-- Listener: pin the search path of the request scope functions. Run once as
-- the database owner, after 0005_live_suggestions. Every name is schema
-- qualified.
--
-- app_client() and app_scope() feed every row level security policy. With an
-- empty search_path they can only resolve built in functions, so no object
-- created elsewhere can stand in for one they call (Supabase security
-- advisor: function_search_path_mutable). Behavior is otherwise unchanged.

begin;

alter function listener.app_client() set search_path = '';
alter function listener.app_scope() set search_path = '';

insert into listener.schema_migrations (version) values ('0006_function_search_path');

commit;
