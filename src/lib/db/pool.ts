import postgres from "postgres";

// One small pool per server instance. prepare:false keeps it compatible with
// transaction mode connection poolers used by hosted Postgres.
let sql: postgres.Sql | undefined;

export function db(): postgres.Sql {
  if (!sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    sql = postgres(url, { prepare: false, max: 3, ssl: local ? false : "require", idle_timeout: 20 });
  }
  return sql;
}

/** Test hook: point the pool at another database. */
export function setDbForTests(instance: postgres.Sql | undefined): void {
  sql = instance;
}
