import { randomUUID } from "node:crypto";
import type { SpeakerMap, StatSegment } from "@/lib/assist/stats";
import { decryptField, encryptField } from "@/lib/crypto/keys";
import { audit } from "@/lib/db/audit";
import { NotFoundError, clientKey } from "@/lib/db/keyring";
import { type Tx, withClient } from "@/lib/db/scoped";
import { suggestionExpiresAt } from "@/lib/policy/retention";

// Live assistant and recall data (SPEC 4.1, 4.2). Every read here runs in one
// client's scope, so nothing from another client can reach a prompt.

const SUGGESTION_TEXT = "suggestions.text";
const SUMMARY = "summaries.content";
const SPEAKERS = "meetings.speaker_map";
const SEGMENT_TEXT = "transcript_segments.text";
const CLIENT_NAME = "clients.name";
const PROJECT_NAME = "projects.name";
const PROJECT_BRIEF = "projects.brief";
const ITEM_TITLE = "action_items.title";
const ITEM_OWNER = "action_items.owner";
const AMENDMENT_TEXT = "brief_amendments.text";

export const SUGGESTION_KINDS = ["talking_point", "question", "reminder", "agenda"] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

export type Suggestion = {
  id: string;
  kind: SuggestionKind;
  text: string;
  sourceMs: number | null;
  pinned: boolean;
  dismissed: boolean;
  createdAt: Date;
};

export type ItemLine = { title: string; owner: string | null; dueDate: string | null; status: "open" | "done"; projectName?: string };

export type PastMeeting = {
  meetingId: string;
  projectName: string;
  date: Date;
  title: string;
  summary: string;
  decisions: string[];
};

export type LiveContext = {
  clientName: string;
  projectName: string;
  brief: string | null;
  amendments: { date: Date; text: string }[];
  template: string;
  openItems: ItemLine[];
  recentMeetings: PastMeeting[];
  /** Cards already shown in this meeting, so the model doesn't repeat them. */
  earlier: { kind: SuggestionKind; text: string }[];
};

type SummaryJson = { title?: string; summary?: string; decisions?: string[] };

async function decryptNames(tx: Tx, dek: Buffer, clientId: string) {
  const projects = await tx<{ id: string; name_enc: string; brief_enc: string | null; status: string }[]>`
    select id, name_enc, brief_enc, status from projects order by created_at`;
  return new Map(projects.map((p) => [p.id, {
    name: decryptField(dek, { clientId, column: PROJECT_NAME, rowId: p.id }, p.name_enc),
    brief: p.brief_enc ? decryptField(dek, { clientId, column: PROJECT_BRIEF, rowId: p.id }, p.brief_enc) : null,
    status: p.status,
  }]));
}

/** Latest summary per meeting, newest meetings first. */
async function recentSummaries(tx: Tx, dek: Buffer, clientId: string, limit: number, projectId: string | null, excludeMeeting: string | null) {
  const rows = await tx<{ id: string; meeting_id: string; project_id: string; started_at: Date; content_enc: string }[]>`
    select s.id, s.meeting_id, m.project_id, m.started_at, s.content_enc
    from (select distinct on (meeting_id) id, meeting_id, content_enc from summaries order by meeting_id, version desc) s
    join meetings m on m.id = s.meeting_id
    where (${projectId}::uuid is null or m.project_id = ${projectId}::uuid)
      and (${excludeMeeting}::uuid is null or m.id <> ${excludeMeeting}::uuid)
    order by m.started_at desc
    limit ${limit}`;
  return rows.map((r) => {
    const c = JSON.parse(decryptField(dek, { clientId, column: SUMMARY, rowId: r.id }, r.content_enc)) as SummaryJson;
    return { meetingId: r.meeting_id, projectId: r.project_id, date: r.started_at, title: c.title ?? "", summary: c.summary ?? "", decisions: c.decisions ?? [] };
  });
}

async function activeAmendments(tx: Tx, dek: Buffer, clientId: string, projectId: string, limit: number) {
  const rows = await tx<{ id: string; text_enc: string; created_at: Date }[]>`
    select id, text_enc, created_at from brief_amendments
    where project_id = ${projectId} and dismissed_at is null order by created_at desc limit ${limit}`;
  return rows.reverse().map((a) => ({ date: a.created_at, text: decryptField(dek, { clientId, column: AMENDMENT_TEXT, rowId: a.id }, a.text_enc) }));
}

function decryptItemLine(dek: Buffer, clientId: string, r: { id: string; title_enc: string; owner_enc: string | null; due_date: string | null; status: "open" | "done" }): ItemLine {
  return {
    title: decryptField(dek, { clientId, column: ITEM_TITLE, rowId: r.id }, r.title_enc),
    owner: r.owner_enc ? decryptField(dek, { clientId, column: ITEM_OWNER, rowId: r.id }, r.owner_enc) : null,
    dueDate: r.due_date,
    status: r.status,
  };
}

/** What the live assistant reads during a meeting: one client, one project. */
export async function loadLiveContext(
  clientId: string,
  meetingId: string,
  limits: { amendments: number; recentSummaries: number; openItems: number },
): Promise<LiveContext> {
  return withClient(clientId, async (tx, id) => {
    const [m] = await tx<{ project_id: string; template: string; client_name: string }[]>`
      select m.project_id, m.template, c.name_enc as client_name
      from meetings m join clients c on c.id = m.client_id where m.id = ${meetingId}`;
    if (!m) throw new NotFoundError("meeting");
    const dek = await clientKey(tx, id);
    const projects = await decryptNames(tx, dek, id);
    const project = projects.get(m.project_id);
    const items = await tx<{ id: string; title_enc: string; owner_enc: string | null; due_date: string | null; status: "open" | "done" }[]>`
      select id, title_enc, owner_enc, to_char(due_date, 'YYYY-MM-DD') as due_date, status from action_items
      where project_id = ${m.project_id} and status = 'open'
      order by due_date nulls last, created_at limit ${limits.openItems}`;
    const earlier = await tx<{ id: string; kind: SuggestionKind; text_enc: string }[]>`
      select id, kind, text_enc from suggestions where meeting_id = ${meetingId} order by created_at`;
    const past = await recentSummaries(tx, dek, id, limits.recentSummaries, m.project_id, meetingId);
    return {
      clientName: decryptField(dek, { clientId: id, column: CLIENT_NAME, rowId: id }, m.client_name),
      projectName: project?.name ?? "",
      brief: project?.brief ?? null,
      amendments: await activeAmendments(tx, dek, id, m.project_id, limits.amendments),
      template: m.template,
      openItems: items.map((r) => decryptItemLine(dek, id, r)),
      recentMeetings: past.map((p) => ({ ...p, projectName: project?.name ?? "" })),
      earlier: earlier.map((e) => ({ kind: e.kind, text: decryptField(dek, { clientId: id, column: SUGGESTION_TEXT, rowId: e.id }, e.text_enc) })),
    };
  });
}

export type NewSuggestion = { kind: SuggestionKind; text: string; sourceMs: number | null };

/** Stores cards encrypted; unpinned cards expire with the transcript (SPEC 5). */
export async function saveSuggestions(clientId: string, meetingId: string, cards: NewSuggestion[], days: number, now = new Date()): Promise<Suggestion[]> {
  if (cards.length === 0) return [];
  return withClient(clientId, async (tx, id) => {
    const [m] = await tx<{ ended_at: Date | null }[]>`select ended_at from meetings where id = ${meetingId}`;
    if (!m) throw new NotFoundError("meeting");
    const dek = await clientKey(tx, id);
    const expiresAt = suggestionExpiresAt(false, m.ended_at, now, days);
    const saved: Suggestion[] = [];
    for (const c of cards) {
      const rowId = randomUUID();
      const [row] = await tx<{ created_at: Date }[]>`
        insert into suggestions (id, client_id, meeting_id, kind, text_enc, source_ms, expires_at)
        values (${rowId}, ${id}, ${meetingId}, ${c.kind}, ${encryptField(dek, { clientId: id, column: SUGGESTION_TEXT, rowId }, c.text)}, ${c.sourceMs}, ${expiresAt})
        returning created_at`;
      saved.push({ id: rowId, kind: c.kind, text: c.text, sourceMs: c.sourceMs, pinned: false, dismissed: false, createdAt: row.created_at });
    }
    await audit(tx, "suggestions.added", { clientId: id, objectId: meetingId, count: saved.length });
    return saved;
  });
}

export async function listSuggestions(clientId: string, meetingId: string, pinnedOnly = false): Promise<Suggestion[]> {
  return withClient(clientId, async (tx, id) => {
    const rows = await tx<{ id: string; kind: SuggestionKind; text_enc: string; source_ms: number | null; pinned: boolean; dismissed: boolean; created_at: Date }[]>`
      select id, kind, text_enc, source_ms, pinned, dismissed, created_at from suggestions
      where meeting_id = ${meetingId} and (${!pinnedOnly} or pinned) order by created_at`;
    if (rows.length === 0) return [];
    const dek = await clientKey(tx, id);
    return rows.map((r) => ({
      id: r.id, kind: r.kind, sourceMs: r.source_ms, pinned: r.pinned, dismissed: r.dismissed, createdAt: r.created_at,
      text: decryptField(dek, { clientId: id, column: SUGGESTION_TEXT, rowId: r.id }, r.text_enc),
    }));
  });
}

/** Pin keeps a card with the summary; unpinning puts it back on the transcript's clock. */
export async function updateSuggestion(
  clientId: string, suggestionId: string, u: { pinned?: boolean; dismissed?: boolean }, days: number, now = new Date(),
): Promise<void> {
  await withClient(clientId, async (tx) => {
    const [row] = await tx<{ ended_at: Date | null }[]>`
      select m.ended_at from suggestions s join meetings m on m.id = s.meeting_id where s.id = ${suggestionId}`;
    if (!row) throw new NotFoundError("suggestion");
    if (u.pinned !== undefined) {
      await tx`update suggestions set pinned = ${u.pinned}, expires_at = ${suggestionExpiresAt(u.pinned, row.ended_at, now, days)}
        where id = ${suggestionId}`;
    }
    if (u.dismissed !== undefined) await tx`update suggestions set dismissed = ${u.dismissed} where id = ${suggestionId}`;
  });
}

/** Moves unpinned cards onto the meeting's end based clock once it ends. */
export async function expireSuggestionsFrom(tx: Tx, meetingId: string, endedAt: Date, days: number): Promise<void> {
  await tx`update suggestions set expires_at = ${suggestionExpiresAt(false, endedAt, endedAt, days)}
    where meeting_id = ${meetingId} and not pinned`;
}

export type RecallMeeting = PastMeeting & {
  /** Transcript still inside the retention window, if any. */
  segments: StatSegment[];
  speakerMap: SpeakerMap;
};

export type RecallContext = {
  clientName: string;
  projects: { name: string; status: string; brief: string | null; amendments: { date: Date; text: string }[] }[];
  meetings: RecallMeeting[];
  items: ItemLine[];
};

/**
 * Everything recall may search for one client (SPEC 4.2): project briefs and
 * amendments, recent summaries, action items, and transcripts still inside
 * retention. Transcripts are added newest first until charBudget is used.
 */
export async function loadRecallContext(
  clientId: string,
  limits: { recentSummaries: number; amendments: number; items: number; transcriptChars: number },
): Promise<RecallContext> {
  return withClient(clientId, async (tx, id) => {
    const [c] = await tx<{ name_enc: string }[]>`select name_enc from clients where id = ${id}`;
    if (!c) throw new NotFoundError("client");
    const dek = await clientKey(tx, id);
    const projectMap = await decryptNames(tx, dek, id);
    const projects = [];
    for (const [pid, p] of projectMap) {
      projects.push({ name: p.name, status: p.status, brief: p.brief, amendments: await activeAmendments(tx, dek, id, pid, limits.amendments) });
    }
    const summaries = await recentSummaries(tx, dek, id, limits.recentSummaries, null, null);
    const withSummary = new Map(summaries.map((s) => [s.meetingId, s]));

    // Meetings with a transcript still on hand, newest first, including ones without a summary yet.
    const live = await tx<{ id: string; project_id: string; started_at: Date; speaker_map_enc: string | null }[]>`
      select m.id, m.project_id, m.started_at, m.speaker_map_enc from meetings m
      where exists (select 1 from transcript_segments t where t.meeting_id = m.id)
      order by m.started_at desc`;
    const meetings: RecallMeeting[] = summaries.map((s) => ({
      meetingId: s.meetingId, projectName: projectMap.get(s.projectId)?.name ?? "", date: s.date,
      title: s.title, summary: s.summary, decisions: s.decisions, segments: [], speakerMap: {},
    }));
    let budget = limits.transcriptChars;
    for (const m of live) {
      if (budget <= 0) break;
      const segs = await tx<{ id: string; speaker: number | null; start_ms: number; end_ms: number; text_enc: string }[]>`
        select id, speaker, start_ms, end_ms, text_enc from transcript_segments where meeting_id = ${m.id} order by seq`;
      const segments: StatSegment[] = [];
      for (const s of segs) {
        const text = decryptField(dek, { clientId: id, column: SEGMENT_TEXT, rowId: s.id }, s.text_enc);
        if (budget - text.length < 0) { budget = 0; break; }
        budget -= text.length;
        segments.push({ speaker: s.speaker, startMs: s.start_ms, endMs: s.end_ms, text });
      }
      const speakerMap = m.speaker_map_enc
        ? (JSON.parse(decryptField(dek, { clientId: id, column: SPEAKERS, rowId: m.id }, m.speaker_map_enc)) as SpeakerMap)
        : {};
      const existing = meetings.find((x) => x.meetingId === m.id);
      if (existing) Object.assign(existing, { segments, speakerMap });
      else if (!withSummary.has(m.id)) {
        meetings.push({ meetingId: m.id, projectName: projectMap.get(m.project_id)?.name ?? "", date: m.started_at, title: "", summary: "", decisions: [], segments, speakerMap });
      }
    }
    meetings.sort((a, b) => b.date.getTime() - a.date.getTime());

    const itemRows = await tx<{ id: string; project_id: string; title_enc: string; owner_enc: string | null; due_date: string | null; status: "open" | "done" }[]>`
      select id, project_id, title_enc, owner_enc, to_char(due_date, 'YYYY-MM-DD') as due_date, status from action_items
      order by (status = 'open') desc, created_at desc limit ${limits.items}`;
    return {
      clientName: decryptField(dek, { clientId: id, column: CLIENT_NAME, rowId: id }, c.name_enc),
      projects,
      meetings,
      items: itemRows.map((r) => ({ ...decryptItemLine(dek, id, r), projectName: projectMap.get(r.project_id)?.name ?? "" })),
    };
  });
}
