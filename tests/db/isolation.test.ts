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
    await admin`truncate clients, projects, meetings, transcript_segments, passkeys, audit_log, summaries, action_items, brief_amendments, meeting_types cascade`;
  });

  it("round trips a client, project, meeting, and transcript", async () => {
    const c = await createClient("Acme");
    const p = await createProject(c, "Website");
    const m = await startMeeting(c, p, "general");
    expect(await saveSegments(c, m, [seg(0, "Hello"), seg(1, "Pricing is 40k")], 30)).toBe(2);
    expect((await loadTranscript(c, m)).map((s) => s.text)).toEqual(["Hello", "Pricing is 40k"]);
    expect(await listDirectory()).toEqual([
      { id: c, name: "Acme", logoVersion: null, projects: [{ id: p, name: "Website", status: "active" }] },
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

describe.skipIf(!run)("summaries and action items", () => {
  let app: postgres.Sql;
  let admin: postgres.Sql;
  const seg = (seq: number, speaker: number, text: string) => ({ seq, speaker, startMs: seq * 5000, endMs: seq * 5000 + 4000, text });

  const fakeOutput = {
    title: "Kickoff call",
    participants: ["Dana"],
    purpose: "Plan launch",
    summary: "Agreed scope and budget.",
    main_points: ["Scope agreed"],
    decisions: ["Launch in July"],
    action_items: [
      { title: "Send proposal", owner: "me" as const, owner_name: null, due_date: "2026-11-06", source_line: 1, source_quote: "I'll send the proposal Friday" },
      { title: "Share brand assets", owner: "them" as const, owner_name: "Dana", due_date: null, source_line: 0, source_quote: "We'll share assets" },
    ],
    key_quotes: [{ quote: "Budget is forty thousand", speaker: "Dana", source_line: 0 }],
    feedback: { went_well: ["Clear"], suggestions: ["Confirm dates"], not_covered: [], commitments_by_me: ["Proposal"], open_questions: [] },
    tags: ["pricing", "bogus"],
    free_tags: ["launch"],
    brief_updates: ["Budget is forty thousand including migration.", "Launch targets July."],
  };

  beforeAll(async () => {
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
    await admin`truncate clients, projects, meetings, transcript_segments, passkeys, audit_log, summaries, action_items, brief_amendments, meeting_types cascade`;
  });

  async function meetingWithTranscript(name: string) {
    const c = await createClient(name);
    const p = await createProject(c, `${name} project`);
    const m = await startMeeting(c, p, "general");
    await saveSegments(c, m, [seg(0, 1, "Budget is forty thousand. We'll share assets."), seg(1, 0, "I'll send the proposal Friday.")], 30);
    await endMeeting(c, m, 30);
    return { c, p, m };
  }

  async function summarize(c: string, m: string, gen = fakeGenerate) {
    const { loadConfig } = await import("@/lib/config");
    const { summarizeMeeting } = await import("@/lib/assist/post");
    return summarizeMeeting(loadConfig(), c, m, "America/Los_Angeles", gen);
  }

  const prompts: string[] = [];
  const fakeGenerate = async (prompt: { user: string }) => {
    prompts.push(prompt.user);
    return { output: fakeOutput, model: "fake-model" };
  };

  it("generates, encrypts, and reads back a summary with action items", async () => {
    const { c, m } = await meetingWithTranscript("Acme");
    const r = await summarize(c, m);
    expect(r.actionItems).toBe(2);
    const { latestSummary, listMeetingItems } = await import("@/lib/db/summaries");
    const s = await latestSummary(c, m);
    expect(s?.content.title).toBe("Kickoff call");
    expect(s?.tags).toEqual(["pricing"]);
    expect(s?.content.stats?.speakers.length).toBe(2);
    const items = await listMeetingItems(c, m);
    expect(items.map((i) => [i.title, i.owner, i.dueDate, i.sourceMs])).toEqual([
      ["Send proposal", "Me", "2026-11-06", 5000],
      ["Share brand assets", "Dana", null, 0],
    ]);
    const dump = JSON.stringify(await admin`select (select json_agg(s) from summaries s) a, (select json_agg(i) from action_items i) b`);
    expect(dump).not.toMatch(/Kickoff|proposal|forty|Dana/i);
  });

  it("sends the model only the meeting's own client", async () => {
    const a = await meetingWithTranscript("Acme");
    await meetingWithTranscript("Beta Secret LLC");
    prompts.length = 0;
    await summarize(a.c, a.m);
    expect(prompts[0]).toContain("Client: Acme");
    expect(prompts[0]).not.toMatch(/Beta Secret/);
  });

  it("keeps versions append only and preserves edited items on regenerate", async () => {
    const { c, m } = await meetingWithTranscript("Acme");
    await summarize(c, m);
    const { listMeetingItems, updateActionItem, saveEditedSummary, latestSummary } = await import("@/lib/db/summaries");
    const [first, second] = await listMeetingItems(c, m);
    await updateActionItem(c, first.id, { title: "Send revised proposal" });
    await updateActionItem(c, second.id, { status: "done" });
    await summarize(c, m);
    const items = await listMeetingItems(c, m);
    // Edited and done items are kept; the done one isn't recreated; "Send proposal" is new
    // because the owner renamed the original.
    expect(items.map((i) => `${i.title}|${i.status}`).sort()).toEqual([
      "Send proposal|open",
      "Send revised proposal|open",
      "Share brand assets|done",
    ]);
    expect(items.filter((i) => i.title === "Send revised proposal")).toHaveLength(1);
    expect(items.filter((i) => i.status === "done")).toHaveLength(1);
    const latest = (await latestSummary(c, m))!;
    await saveEditedSummary(c, m, { ...latest.content, title: "Edited title" }, ["timeline"]);
    const versions = await admin`select version, source from summaries order by version`;
    expect(versions.map((v) => `${v.version}:${v.source}`)).toEqual(["1:model", "2:model", "3:edit"]);
    expect((await latestSummary(c, m))?.content.stats).toBeDefined();
  });

  it("app role cannot rewrite or delete summary history", async () => {
    const { c, m } = await meetingWithTranscript("Acme");
    await summarize(c, m);
    await expect(withClient(c, (tx) => tx`update summaries set version = 9`)).rejects.toThrow(/permission denied/);
    await expect(withClient(c, (tx) => tx`delete from summaries`)).rejects.toThrow(/permission denied/);
  });

  it("isolates summaries and items between clients", async () => {
    const a = await meetingWithTranscript("A");
    const b = await meetingWithTranscript("B");
    await summarize(b.c, b.m);
    const { latestSummary, listMeetingItems, updateActionItem } = await import("@/lib/db/summaries");
    expect(await latestSummary(a.c, b.m)).toBeNull();
    expect(await listMeetingItems(a.c, b.m)).toEqual([]);
    const [itemB] = await listMeetingItems(b.c, b.m);
    await expect(updateActionItem(a.c, itemB.id, { status: "done" })).rejects.toThrow(/not found/);
  });

  it("lists open items across clients, and that scope reads nothing else", async () => {
    const a = await meetingWithTranscript("Acme");
    const b = await meetingWithTranscript("Beta");
    await summarize(a.c, a.m);
    await summarize(b.c, b.m);
    const { listOpenItems } = await import("@/lib/db/openItems");
    const { listMeetingItems, updateActionItem } = await import("@/lib/db/summaries");
    const [done] = await listMeetingItems(a.c, a.m);
    await updateActionItem(a.c, done.id, { status: "done" });
    const open = await listOpenItems();
    expect(open).toHaveLength(3);
    expect(new Set(open.map((o) => o.clientName))).toEqual(new Set(["Acme", "Beta"]));
    expect(open[0].dueDate).toBe("2026-11-06"); // dated items first
    const leaked = await app.begin(async (tx) => {
      await tx`select set_config('search_path', 'listener', true), set_config('app.scope', 'open_items', true)`;
      return {
        summaries: await tx`select * from summaries`,
        segments: await tx`select * from transcript_segments`,
        meetings: await tx`select * from meetings`,
      };
    });
    expect(leaked).toEqual({ summaries: [], segments: [], meetings: [] });
  });

  it("deleting a client removes its summaries and items", async () => {
    const { c, m } = await meetingWithTranscript("Acme");
    await summarize(c, m);
    await deleteClient(c);
    const [counts] = await admin`select (select count(*)::int from summaries) s, (select count(*)::int from action_items) i`;
    expect(counts).toEqual({ s: 0, i: 0 });
  });

  it("adds brief amendments from the meeting without touching the original brief", async () => {
    const { c, p, m } = await meetingWithTranscript("Acme");
    await updateProject(c, p, { brief: "Original brief." });
    await summarize(c, m);
    const { listAmendments } = await import("@/lib/db/amendments");
    const list = await listAmendments(c, p);
    expect(list.map((a) => [a.text, a.source, a.meetingId === m, a.meetingTitle])).toEqual([
      ["Budget is forty thousand including migration.", "meeting", true, "Kickoff call"],
      ["Launch targets July.", "meeting", true, "Kickoff call"],
    ]);
    expect(await getProjectBrief(c, p)).toBe("Original brief.");
    const dump = JSON.stringify(await admin`select * from brief_amendments`);
    expect(dump).not.toMatch(/forty|July/);
  });

  it("feeds earlier amendments to the next meeting and skips known facts", async () => {
    const { c, p, m } = await meetingWithTranscript("Acme");
    await summarize(c, m);
    const m2 = await startMeeting(c, p, "general");
    await saveSegments(c, m2, [seg(0, 0, "Quick sync.")], 30);
    prompts.length = 0;
    await summarize(c, m2);
    expect(prompts[0]).toMatch(/<brief_amendments>[\s\S]*Launch targets July\.[\s\S]*<\/brief_amendments>/);
    const { listAmendments } = await import("@/lib/db/amendments");
    // The fake model repeats the same two facts; they're already known, so nothing new is added.
    expect((await listAmendments(c, p)).filter((a) => a.meetingId === m2)).toHaveLength(0);
  });

  it("regenerating replaces a meeting's amendments but keeps dismissed ones dismissed", async () => {
    const { c, p, m } = await meetingWithTranscript("Acme");
    await summarize(c, m);
    const { listAmendments, setAmendmentDismissed } = await import("@/lib/db/amendments");
    const [first] = await listAmendments(c, p);
    await setAmendmentDismissed(c, first.id, true);
    await summarize(c, m);
    const after = await listAmendments(c, p);
    expect(after.map((a) => `${a.text}|${a.dismissed}`).sort()).toEqual([
      "Budget is forty thousand including migration.|true",
      "Launch targets July.|false",
    ]);
  });

  it("owner notes are added, and amendment text can never be edited", async () => {
    const { c, p } = await meetingWithTranscript("Acme");
    const { addOwnerNote, listAmendments, setAmendmentDismissed } = await import("@/lib/db/amendments");
    const id = await addOwnerNote(c, p, "Legal must review the privacy page.");
    await setAmendmentDismissed(c, id, true);
    await setAmendmentDismissed(c, id, false);
    expect((await listAmendments(c, p)).map((a) => [a.text, a.source, a.dismissed])).toEqual([
      ["Legal must review the privacy page.", "owner", false],
    ]);
    await expect(withClient(c, (tx) => tx`update brief_amendments set text_enc = 'x'`)).rejects.toThrow(/permission denied/);
    await expect(withClient(c, (tx) => tx`update brief_amendments set source = 'meeting'`)).rejects.toThrow(/permission denied/);
  });

  it("isolates amendments between clients", async () => {
    const a = await meetingWithTranscript("A");
    const b = await meetingWithTranscript("B");
    await summarize(b.c, b.m);
    const { listAmendments, setAmendmentDismissed } = await import("@/lib/db/amendments");
    expect(await listAmendments(a.c, b.p)).toEqual([]);
    const [amend] = await listAmendments(b.c, b.p);
    await expect(setAmendmentDismissed(a.c, amend.id, true)).rejects.toThrow(/not found/);
  });

  it("lists recent meetings across clients with titles and participants, and that scope reads nothing else", async () => {
    const a = await meetingWithTranscript("Acme");
    const b = await meetingWithTranscript("Beta");
    await summarize(a.c, a.m);
    const { setSpeakerMap } = await import("@/lib/db/summaries");
    await setSpeakerMap(b.c, b.m, { "0": "Me", "1": "Priya" });
    const { listRecentMeetings } = await import("@/lib/db/recent");
    const all = await listRecentMeetings(10);
    expect(all.map((m) => [m.clientName, m.title, m.participants, m.openItems]).sort()).toEqual([
      ["Acme", "Kickoff call", ["Dana"], 2],
      ["Beta", null, ["Priya"], 0],
    ]);
    expect((await listRecentMeetings(10, b.c)).map((m) => m.clientName)).toEqual(["Beta"]);
    expect(await listRecentMeetings(10, a.c, b.p)).toEqual([]);
    const leaked = await app.begin(async (tx) => {
      await tx`select set_config('search_path', 'listener', true), set_config('app.scope', 'recent', true)`;
      return {
        segments: await tx`select * from transcript_segments`,
        items: await tx`select * from action_items`,
        amendments: await tx`select * from brief_amendments`,
        projects: await tx`select * from projects`,
        clients: await tx`select * from clients`,
      };
    });
    expect(leaked).toEqual({ segments: [], items: [], amendments: [], projects: [], clients: [] });
    // The recent scope has select policies only, so writes touch nothing.
    const updated = await app.begin(async (tx) => {
      await tx`select set_config('search_path', 'listener', true), set_config('app.scope', 'recent', true)`;
      return tx`update meetings set template = 'x' returning id`;
    });
    expect(updated).toEqual([]);
  });

  it("stores logos encrypted and only for their own client", async () => {
    const a = await meetingWithTranscript("Acme");
    const b = await meetingWithTranscript("Beta");
    const { setClientLogo, getClientLogo } = await import("@/lib/db/directory");
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("acme-logo-bytes")]);
    await setClientLogo(a.c, { mime: "image/png", base64: png.toString("base64") });
    expect((await getClientLogo(a.c))?.bytes).toEqual(png);
    expect(await getClientLogo(b.c)).toBeNull();
    const dir = await listDirectory();
    expect(dir.find((c) => c.id === a.c)?.logoVersion).toBeTypeOf("number");
    expect(dir.find((c) => c.id === b.c)?.logoVersion).toBeNull();
    const [row] = await admin`select logo_enc from clients where id = ${a.c}`;
    expect(row.logo_enc).toMatch(/^v1:/);
    expect(Buffer.from(row.logo_enc.slice(3), "base64").toString("latin1")).not.toContain("acme-logo-bytes");
    await setClientLogo(a.c, null);
    expect(await getClientLogo(a.c)).toBeNull();
  });

  it("seeds meeting types from config, keeps keys on rename, and archives", async () => {
    const { listMeetingTypes, createMeetingType, updateMeetingType, getMeetingType } = await import("@/lib/db/meetingTypes");
    const defaults = { general: { watch_for: ["dates"] }, status_update: { watch_for: ["blockers"] } };
    const seeded = await listMeetingTypes(defaults);
    expect(seeded.map((t) => [t.key, t.name])).toEqual([["general", "General"], ["status_update", "Status update"]]);
    expect(await listMeetingTypes({ other: { watch_for: [] } })).toHaveLength(2); // seeds only once
    const t = await createMeetingType("Status Update", ["risks"]);
    expect(t.key).toBe("status_update_2");
    await updateMeetingType(seeded[0].id, { name: "Check-in", watchFor: ["dates", "owners"] });
    expect(await getMeetingType("general")).toMatchObject({ name: "Check-in", watchFor: ["dates", "owners"] });
    await updateMeetingType(t.id, { archived: true });
    expect((await listMeetingTypes(defaults)).map((x) => x.key)).toEqual(["general", "status_update"]);
    expect((await listMeetingTypes(defaults, true)).map((x) => x.key)).toContain("status_update_2");
    const c = await createClient("Scope check");
    await expect(withClient(c, (tx) => tx`select * from meeting_types`)).resolves.toEqual([]);
  });

  it("refuses to summarize an empty meeting", async () => {
    const c = await createClient("Empty");
    const m = await startMeeting(c, await createProject(c, "P"), "general");
    await expect(summarize(c, m)).rejects.toThrow(/no transcript/);
  });
});
