import postgres from "postgres";
import { logInfo } from "@/lib/log";
import { databaseTls } from "@/lib/policy/transport";

// One small pool per server instance. prepare:false keeps it compatible with
// transaction mode connection poolers used by hosted Postgres.
let sql: postgres.Sql | undefined;

export function db(): postgres.Sql {
  if (!sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const ssl = databaseTls(url, process.env.DATABASE_CA_CERT);
    if (ssl === "require") logInfo("db.tls_unverified");
    sql = postgres(url, { prepare: false, max: 3, ssl, idle_timeout: 20 });
  }
  return sql;
}

/** Test hook: point the pool at another database. */
export function setDbForTests(instance: postgres.Sql | undefined): void {
  sql = instance;
}
