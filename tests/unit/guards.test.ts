// Structural checks over the source tree for CLAUDE.md rules 2, 3, and 6.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = path.join(import.meta.dirname, "../..");
const src = path.join(root, "src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

const sources = files(src).map((p) => ({ rel: path.relative(root, p), text: readFileSync(p, "utf8") }));

describe("source guards", () => {
  it("logs only through src/lib/log.ts on the server", () => {
    const offenders = sources.filter(
      (f) =>
        f.rel !== "src/lib/log.ts" &&
        /console\.(log|info|warn|error|debug)\(/.test(f.text),
    );
    expect(offenders.map((f) => f.rel)).toEqual([]);
  });

  it("never passes transcript or name text to the logger", () => {
    const calls = sources.flatMap((f) => [...f.text.matchAll(/log(Info|Error)\(([^;]*)\);/g)].map((m) => `${f.rel}: ${m[2]}`));
    for (const call of calls) expect(call).not.toMatch(/\b(text|name|brief|transcript|segments?\s*:|body)\b/);
  });

  it("queries client tables only inside a scoped transaction", () => {
    const dbFiles = sources.filter((f) => f.rel.startsWith("src/lib/db/") && !f.rel.endsWith("scoped.ts") && !f.rel.endsWith("pool.ts"));
    for (const f of dbFiles) {
      // Raw db()`...` is only allowed for the purge function, which is security definer.
      const raw = [...f.text.matchAll(/db\(\)(<[^>]*>)?`([^`]*)`/g)].map((m) => m[2]);
      for (const q of raw) expect(`${f.rel}: ${q}`).toMatch(/purge_expired/);
    }
  });

  it("never sends open items, or anything cross client, to the model", () => {
    const viewFiles = sources.filter((f) => /openItems|open-items|api\/directory|db\/recent|meetings\/recent|live\/now|manage\//i.test(f.rel));
    expect(viewFiles.length).toBeGreaterThan(0);
    for (const f of viewFiles) expect(`${f.rel}`).not.toSatisfy(() => /@\/lib\/assist|@anthropic-ai\/sdk/.test(f.text.replace(/^import type .*$/gm, "")));
  });

  it("calls the model provider from one module only", () => {
    const users = sources.filter((f) => f.text.includes("@anthropic-ai/sdk")).map((f) => f.rel);
    expect(users).toEqual(["src/lib/assist/claude.ts"]);
  });

  it("keeps the cron schedule in vercel.json equal to config.yaml", () => {
    const config = parse(readFileSync(path.join(root, "config.yaml"), "utf8"));
    const vercel = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8"));
    expect(vercel.crons[0].schedule).toBe(config.retention.purge_cron_utc);
  });
});
