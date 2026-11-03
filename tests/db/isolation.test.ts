// Runs against a real Postgres with db/migrations applied. Set
// TEST_DATABASE_URL (connects as listener_app) and TEST_DATABASE_ADMIN_URL
// (owner, used only to reset tables and inspect raw rows).
import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClient, createProject, deleteClient, getProjectBrief, listDirectory, renameClient, updateProject } from "@/lib/db/directory";
import { setDbForTests } from "@/lib/db/pool";
import { endMeeting, loadTranscript, saveSegments, startMeeting } from "@/lib/db/meetings";
import { purgeExpired } from "@/lib/db/purge";
import { countPasskeys, getPasskey, savePasskey } from "@/lib/db/passkeys";
import { withClient } from "@/lib/db/scoped";
import { ScopeError } from "@/lib/policy/scope";

const appUrl = process.env.TEST_DATABASE_URL;
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const run = Boolean(appUrl && adminUrl);

describe.skipIf(!run)("database isolation", () => {
  let app: postgres.Sql;
  let admin: postgres.Sql;
  const seg = (seq: number, text: string) => ({ seq, speaker: 0, startMs: seq * 1000, endMs: seq * 1000 + 900, text });

  beforeAll(() => {
    process.env.LISTENER_MASTER_KEY = randomBytes(32).toString("base64");
    app = postgres(appUrl!, { prepare: false, max: 2 });
    admin = postgres(adminUrl!, { max: 1, onnotice: () => undefined, connection: { search_path: "listener" } });
    setDbForTests(app);
  });

  afterAll(async () => {
    setDbForTests(undefined);
    await app.end();
    await admin.end();
  });

  beforeEach(async () => {
    await admin`truncate clients, projects, meetings, transcript_segments, passkeys, audit_log cascade`;
  });

  it("round trips a client, project, meeting, and transcript", async () => {
    const c = await createClient("Acme");
    const p = await createProject(c, "Website");
    const m = await startMeeting(c, p, "general");
    expect(await saveSegments(c, m, [seg(0, "Hello"), seg(1, "Pricing is 40k")], 30)).toBe(2);
    expect((await loadTranscript(c, m)).map((s) => s.text)).toEqual(["Hello", "Pricing is 40k"]);
    expect(await listDirectory()).toEqual([
      { id: c, name: "Acme", projects: [{ id: p, name: "Website", status: "active" }] },
    ]);
  });

  it("stores names and transcript text only as ciphertext", async () => {
    const c = await createClient("Acme Secret Client");
    const p = await createProject(c, "Project Falcon");
    const m = await startMeeting(c, p, "general");
    await saveSegments(c, m, [seg(0, "the merger closes friday")], 30);
    const dump = JSON.stringify(await admin`
      select (select json_agg(c) from clients c) a, (select json_agg(p) from projects p) b,
             (select json_agg(s) from transcript_segments s) d`);
    expect(dump).not.toMatch(/Acme Secret|Falcon|merger/);
  });

  it("sees nothing without a client scope", async () => {
    const c = await createClient("Acme");
    await createProject(c, "Website");
    const rows = await app.begin(async (tx) => ({
      _: await tx`set local search_path = listener`,
      clients: await tx`select * from clients`,
      projects: await tx`select * from projects`,
    }));
    expect(rows.clients).toHaveLength(0);
    expect(rows.projects).toHaveLength(0);
  });

  it("cannot write without a client scope", async () => {
    await expect(app`insert into listener.clients (id, name_enc, wrapped_dek) values (${randomUUID()}, 'x', 'y')`).rejects.toThrow(
      /row-level security/,
    );
  });

  it("rejects a malformed scope before reaching the database", async () => {
    await expect(withClient("not-a-uuid", async () => 1)).rejects.toBeInstanceOf(ScopeError);
  });

  it("hides another client's rows inside a client scope", async () => {
    const a = await createClient("A");
    const b = await createClient("B");
    const pb = await createProject(b, "B project");
    const mb = await startMeeting(b, pb, "general");
    await saveSegments(b, mb, [seg(0, "b secret")], 30);
    const seen = await withClient(a, async (tx) => ({
      clients: await tx`select id from clients`,
      projects: await tx`select id from projects`,
      segments: await tx`select id from transcript_segments`,
    }));
    expect(seen.clients.map((r) => r.id)).toEqual([a]);
    expect(seen.projects).toHaveLength(0);
    expect(seen.segments).toHaveLength(0);
    expect(await loadTranscript(a, mb)).toEqual([]);
  });

  it("refuses to start a meeting under one client with another client's project", async () => {
    const a = await createClient("A");
    const b = await createClient("B");
    const pb = await createProject(b, "B project");
    await expect(startMeeting(a, pb, "general")).rejects.toThrow();
  });

  it("refuses to save segments into another client's meeting", async () => {
    const a = await createClient("A");
    const b = await createClient("B");
    const mb = await startMeeting(b, await createProject(b, "B"), "general");
    await expect(saveSegments(a, mb, [seg(0, "x")], 30)).rejects.toThrow(/meeting not found/);
  });

  it("refuses to update or delete another client's rows", async () => {
    const a = await createClient("A");
    const b = await createClient("B");
    const pb = await createProject(b, "B project");
    await expect(updateProject(a, pb, { name: "hijack" })).rejects.toThrow(/project not found/);
    await withClient(a, async (tx) => {
      expect(await tx`delete from projects where id = ${pb} returning id`).toHaveLength(0);
    });
    expect((await listDirectory()).find((c) => c.id === b)?.projects[0].name).toBe("B project");
  });

  it("ignores duplicate segment uploads", async () => {
    const c = await createClient("A");
    const m = await startMeeting(c, await createProject(c, "P"), "general");
    expect(await saveSegments(c, m, [seg(0, "one"), seg(1, "two")], 30)).toBe(2);
    expect(await saveSegments(c, m, [seg(1, "two"), seg(2, "three")], 30)).toBe(1);
    expect((await loadTranscript(c, m)).map((s) => s.seq)).toEqual([0, 1, 2]);
  });

  it("sets expiry to 30 days after the meeting ends", async () => {
    const c = await createClient("A");
    const m = await startMeeting(c, await createProject(c, "P"), "general");
    await saveSegments(c, m, [seg(0, "x")], 30, new Date("2026-11-03T10:00:00Z"));
    await endMeeting(c, m, 30, new Date("2026-11-03T11:00:00Z"));
    const [row] = await admin`select expires_at from transcript_segments`;
    expect(new Date(row.expires_at).toISOString()).toBe("2026-12-03T11:00:00.000Z");
  });

  it("purges expired transcript rows only, and audits the count", async () => {
    const c = await createClient("A");
    const m = await startMeeting(c, await createProject(c, "P"), "general");
    await saveSegments(c, m, [seg(0, "old"), seg(1, "older")], 30);
    await admin`update transcript_segments set expires_at = now() - interval '1 minute' where seq = 0`;
    expect(await purgeExpired(365)).toBe(1);
    expect((await loadTranscript(c, m)).map((s) => s.text)).toEqual(["older"]);
    const [log] = await admin`select count from audit_log where event = 'purge.segments'`;
    expect(log.count).toBe(1);
  });

  it("deletes everything under a client", async () => {
    const c = await createClient("A");
    const keep = await createClient("B");
    const m = await startMeeting(c, await createProject(c, "P"), "general");
    await saveSegments(c, m, [seg(0, "x")], 30);
    await deleteClient(c);
    const [counts] = await admin`select
      (select count(*)::int from clients) clients, (select count(*)::int from projects) projects,
      (select count(*)::int from meetings) meetings, (select count(*)::int from transcript_segments) segments`;
    expect(counts).toEqual({ clients: 1, projects: 0, meetings: 0, segments: 0 });
    expect((await listDirectory()).map((x) => x.id)).toEqual([keep]);
  });

  it("renames and stores briefs encrypted", async () => {
    const c = await createClient("A");
    const p = await createProject(c, "P");
    await renameClient(c, "Acme Corp");
    await updateProject(c, p, { brief: "Goals: launch", status: "archived" });
    expect(await getProjectBrief(c, p)).toBe("Goals: launch");
    const dir = await listDirectory();
    expect(dir[0].name).toBe("Acme Corp");
    expect(dir[0].projects[0].status).toBe("archived");
  });

  it("can't read the audit log or passkeys from a client scope", async () => {
    await savePasskey({ id: "cred1", publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ["internal"] });
    const c = await createClient("A");
    await expect(withClient(c, (tx) => tx`select * from audit_log`)).rejects.toThrow(/permission denied/);
    expect(await withClient(c, (tx) => tx`select * from passkeys`)).toHaveLength(0);
    expect(await countPasskeys()).toBe(1);
    expect((await getPasskey("cred1"))?.publicKey).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("app role cannot change the schema or bypass security", async () => {
    await expect(app`alter table listener.clients disable row level security`).rejects.toThrow();
    await expect(app`truncate listener.transcript_segments`).rejects.toThrow();
    const c = await createClient("A");
    await expect(
      app.begin(async (tx) => {
        await tx`select set_config('app.client_id', ${c}, true)`;
        await tx`set local row_security = off`;
        return tx`select * from listener.clients`;
      }),
    ).rejects.toThrow(/row-level security/);
  });
});

describe.skipIf(!run)("hosted provider roles", () => {
  it("other roles get nothing in the listener schema", async () => {
    const admin = postgres(adminUrl!, { max: 1, onnotice: () => undefined });
    try {
      await admin`do $$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if; end $$`;
      const [r] = await admin`select
        has_schema_privilege('anon', 'listener', 'usage') as schema_usage,
        has_table_privilege('anon', 'listener.clients', 'select') as clients_select,
        has_function_privilege('anon', 'listener.purge_expired(integer)', 'execute') as purge_exec`;
      expect(r).toEqual({ schema_usage: false, clients_select: false, purge_exec: false });
    } finally {
      await admin.end();
    }
  });
});
