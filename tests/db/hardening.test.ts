// Runs against a real Postgres with db/migrations applied (see isolation.test.ts).
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const appUrl = process.env.TEST_DATABASE_URL;
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;

describe.skipIf(!(appUrl && adminUrl))("database hardening", () => {
  let admin: postgres.Sql;
  let app: postgres.Sql;

  beforeAll(() => {
    admin = postgres(adminUrl!, { max: 1, onnotice: () => undefined });
    app = postgres(appUrl!, { prepare: false, max: 1 });
  });

  afterAll(async () => {
    await admin.end();
    await app.end();
  });

  it("pins the search path of every function in the schema", async () => {
    const rows = await admin`
      select p.proname, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'listener'`;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect((row.proconfig ?? []).some((c: string) => c.startsWith("search_path="))).toBe(true);
    }
  });

  it("scope functions still read the request settings with an empty search path", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const [row] = await app.begin(async (tx) => {
      await tx`select set_config('app.client_id', ${id}, true), set_config('app.scope', 'all', true)`;
      return tx`select listener.app_client() as client, listener.app_scope() as scope`;
    });
    expect(row).toEqual({ client: id, scope: "all" });
    const [unset] = await app`select listener.app_client() as client, listener.app_scope() as scope`;
    expect(unset).toEqual({ client: null, scope: "client" });
  });

  it("the app role cannot bypass row level security", async () => {
    const [role] = await admin`select rolbypassrls, rolsuper from pg_roles where rolname = 'listener_app'`;
    expect(role).toEqual({ rolbypassrls: false, rolsuper: false });
  });
});
