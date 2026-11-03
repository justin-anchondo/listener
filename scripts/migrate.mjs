// Applies db/migrations/*.sql in order, skipping ones already recorded.
// Usage: DATABASE_ADMIN_URL=postgres://owner@host/db npm run db:migrate
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_ADMIN_URL;
if (!url) {
  console.error("Set DATABASE_ADMIN_URL to the database owner connection string.");
  process.exit(1);
}
const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const sql = postgres(url, { max: 1, ssl: local ? false : "require", onnotice: () => undefined });
const dir = path.join(import.meta.dirname, "../db/migrations");

try {
  const [{ exists }] = await sql`select to_regclass('listener.schema_migrations') is not null as exists`;
  const done = new Set(exists ? (await sql`select version from listener.schema_migrations`).map((r) => r.version) : []);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const version = file.replace(/\.sql$/, "");
    if (done.has(version)) continue;
    await sql.unsafe(readFileSync(path.join(dir, file), "utf8"));
    console.log(`applied ${version}`);
  }
  console.log("migrations up to date");
} finally {
  await sql.end();
}
