import { randomUUID } from "node:crypto";
import { SummaryContent, type CleanActionItem, type SummaryContentT } from "@/lib/assist/schema";
import type { SpeakerMap, StatSegment, TalkStats } from "@/lib/assist/stats";
import { decryptField, encryptField } from "@/lib/crypto/keys";
import { audit } from "@/lib/db/audit";
import { NotFoundError, clientKey } from "@/lib/db/keyring";
import { loadTranscript } from "@/lib/db/meetings";
import { type Tx, withClient } from "@/lib/db/scoped";

const SUMMARY = "summaries.content";
const SPEAKERS = "meetings.speaker_map";
const CLIENT_NAME = "clients.name";
const PROJECT_NAME = "projects.name";
const PROJECT_BRIEF = "projects.brief";
const ITEM_TITLE = "action_items.title";
const ITEM_OWNER = "action_items.owner";
const ITEM_QUOTE = "action_items.source_quote";

export type StoredSummary = {
  id: string;
  version: number;
  source: "model" | "edit";
  model: string | null;
  tags: string[];
  createdAt: Date;
  content: SummaryContentT & { stats?: TalkStats };
};

export type ActionItem = {
  id: string;
  meetingId: string | null;
  projectId: string;
  title: string;
  owner: string | null;
  dueDate: string | null;
  status: "open" | "done";
  snoozedUntil: string | null;
  sourceQuote: string | null;
  sourceMs: number | null;
  edited: boolean;
  createdAt: Date;
};

export type MeetingContext = {
  clientName: string;
  projectId: string;
  projectName: string;
  brief: string | null;
  template: string;
  startedAt: Date;
  endedAt: Date | null;
  speakerMap: SpeakerMap;
  segments: StatSegment[];
};

type ItemRow = {
  id: string;
  meeting_id: string | null;
  project_id: string;
  title_enc: string;
  owner_enc: string | null;
  due_date: string | null;
  status: "open" | "done";
  snoozed_until: string | null;
  source_quote_enc: string | null;
  source_ms: number | null;
  edited: boolean;
  created_at: Date;
};

function decryptItem(dek: Buffer, clientId: string, r: ItemRow): ActionItem {
  const ref = (column: string) => ({ clientId, column, rowId: r.id });
  return {
    id: r.id,
    meetingId: r.meeting_id,
    projectId: r.project_id,
    title: decryptField(dek, ref(ITEM_TITLE), r.title_enc),
    owner: r.owner_enc ? decryptField(dek, ref(ITEM_OWNER), r.owner_enc) : null,
    dueDate: r.due_date,
    status: r.status,
    snoozedUntil: r.snoozed_until,
    sourceQuote: r.source_quote_enc ? decryptField(dek, ref(ITEM_QUOTE), r.source_quote_enc) : null,
    sourceMs: r.source_ms,
    edited: r.edited,
    createdAt: r.created_at,
  };
}

export function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const ITEM_COLUMNS = "id, meeting_id, project_id, title_enc, owner_enc, to_char(due_date, 'YYYY-MM-DD') as due_date, status, to_char(snoozed_until, 'YYYY-MM-DD') as snoozed_until, source_quote_enc, source_ms, edited, created_at";

/** Everything the post meeting prompt needs, decrypted, for one client. */
export async function loadMeetingContext(clientId: string, meetingId: string): Promise<MeetingContext> {
  const segments = await loadTranscript(clientId, meetingId);
  return withClient(clientId, async (tx, id) => {
    const rows = await tx<{
      client_name: string; project_id: string; project_name: string; brief_enc: string | null;
      template: string; started_at: Date; ended_at: Date | null; speaker_map_enc: string | null;
    }[]>`
      select c.name_enc as client_name, p.id as project_id, p.name_enc as project_name, p.brief_enc,
             m.template, m.started_at, m.ended_at, m.speaker_map_enc
      from meetings m join projects p on p.id = m.project_id join clients c on c.id = m.client_id
      where m.id = ${meetingId}`;
    if (rows.length === 0) throw new NotFoundError("meeting");
    const r = rows[0];
    const dek = await clientKey(tx, id);
    return {
      clientName: decryptField(dek, { clientId: id, column: CLIENT_NAME, rowId: id }, r.client_name),
      projectId: r.project_id,
      projectName: decryptField(dek, { clientId: id, column: PROJECT_NAME, rowId: r.project_id }, r.project_name),
      brief: r.brief_enc ? decryptField(dek, { clientId: id, column: PROJECT_BRIEF, rowId: r.project_id }, r.brief_enc) : null,
      template: r.template,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      speakerMap: r.speaker_map_enc
        ? (JSON.parse(decryptField(dek, { clientId: id, column: SPEAKERS, rowId: meetingId }, r.speaker_map_enc)) as SpeakerMap)
        : {},
      segments,
    };
  });
}

async function nextVersion(tx: Tx, meetingId: string): Promise<number> {
  const [row] = await tx<{ v: number }[]>`select coalesce(max(version), 0)::int + 1 as v from summaries where meeting_id = ${meetingId}`;
  return row.v;
}

async function insertSummary(
  tx: Tx, dek: Buffer, clientId: string, meetingId: string,
  source: "model" | "edit", model: string | null, content: StoredSummary["content"], tags: string[],
): Promise<string> {
  const id = randomUUID();
  const version = await nextVersion(tx, meetingId);
  const contentEnc = encryptField(dek, { clientId, column: SUMMARY, rowId: id }, JSON.stringify(content));
  await tx`insert into summaries (id, client_id, meeting_id, version, source, model, content_enc, tags)
    values (${id}, ${clientId}, ${meetingId}, ${version}, ${source}, ${model}, ${contentEnc}, ${tags})`;
  return id;
}

async function insertItem(tx: Tx, dek: Buffer, clientId: string, projectId: string, meetingId: string | null, a: CleanActionItem, edited: boolean) {
  const id = randomUUID();
  const ref = (column: string) => ({ clientId, column, rowId: id });
  await tx`insert into action_items (id, client_id, project_id, meeting_id, title_enc, owner_enc, due_date, source_quote_enc, source_ms, edited)
    values (${id}, ${clientId}, ${projectId}, ${meetingId},
      ${encryptField(dek, ref(ITEM_TITLE), a.title)},
      ${a.owner ? encryptField(dek, ref(ITEM_OWNER), a.owner) : null},
      ${a.dueDate}, ${a.sourceQuote ? encryptField(dek, ref(ITEM_QUOTE), a.sourceQuote) : null},
      ${a.sourceMs}, ${edited})`;
  return id;
}

/**
 * Saves a model generated summary as a new version. Action items the owner
 * hasn't touched (open, not edited) are replaced; edited or closed ones stay.
 */
export async function saveGeneratedSummary(
  clientId: string, meetingId: string, model: string,
  content: StoredSummary["content"], tags: string[], items: CleanActionItem[],
): Promise<string> {
  return withClient(clientId, async (tx, id) => {
    const [meeting] = await tx<{ project_id: string }[]>`select project_id from meetings where id = ${meetingId}`;
    if (!meeting) throw new NotFoundError("meeting");
    const dek = await clientKey(tx, id);
    const summaryId = await insertSummary(tx, dek, id, meetingId, "model", model, content, tags);
    await tx`delete from action_items where meeting_id = ${meetingId} and status = 'open' and not edited`;
    // Don't recreate an item the owner already completed or edited.
    const kept = await tx<{ id: string; title_enc: string }[]>`select id, title_enc from action_items where meeting_id = ${meetingId}`;
    const keptTitles = new Set(kept.map((k) => normalizeTitle(decryptField(dek, { clientId: id, column: ITEM_TITLE, rowId: k.id }, k.title_enc))));
    const fresh = items.filter((a) => !keptTitles.has(normalizeTitle(a.title)));
    for (const a of fresh) await insertItem(tx, dek, id, meeting.project_id, meetingId, a, false);
    await audit(tx, "summary.generated", { clientId: id, objectId: meetingId, count: fresh.length });
    return summaryId;
  });
}

/** Saves the owner's edits as a new version. Earlier versions are kept. */
export async function saveEditedSummary(clientId: string, meetingId: string, content: SummaryContentT, tags: string[]): Promise<string> {
  const valid = SummaryContent.parse(content);
  return withClient(clientId, async (tx, id) => {
    const [latest] = await tx<{ content_enc: string; id: string }[]>`
      select id, content_enc from summaries where meeting_id = ${meetingId} order by version desc limit 1`;
    const dek = await clientKey(tx, id);
    // Keep the computed talk stats from the previous version.
    const prev = latest
      ? (JSON.parse(decryptField(dek, { clientId: id, column: SUMMARY, rowId: latest.id }, latest.content_enc)) as StoredSummary["content"])
      : null;
    const [m] = await tx`select 1 from meetings where id = ${meetingId}`;
    if (!m) throw new NotFoundError("meeting");
    const summaryId = await insertSummary(tx, dek, id, meetingId, "edit", null, { ...valid, stats: prev?.stats }, tags);
    await audit(tx, "summary.edited", { clientId: id, objectId: meetingId });
    return summaryId;
  });
}

export async function latestSummary(clientId: string, meetingId: string): Promise<StoredSummary | null> {
  return withClient(clientId, async (tx, id) => {
    const rows = await tx<{ id: string; version: number; source: "model" | "edit"; model: string | null; tags: string[]; created_at: Date; content_enc: string }[]>`
      select id, version, source, model, tags, created_at, content_enc from summaries
      where meeting_id = ${meetingId} order by version desc limit 1`;
    if (rows.length === 0) return null;
    const r = rows[0];
    const dek = await clientKey(tx, id);
    return {
      id: r.id, version: r.version, source: r.source, model: r.model, tags: r.tags, createdAt: r.created_at,
      content: JSON.parse(decryptField(dek, { clientId: id, column: SUMMARY, rowId: r.id }, r.content_enc)),
    };
  });
}

export async function setSpeakerMap(clientId: string, meetingId: string, map: SpeakerMap): Promise<void> {
  await withClient(clientId, async (tx, id) => {
    const dek = await clientKey(tx, id);
    const enc = encryptField(dek, { clientId: id, column: SPEAKERS, rowId: meetingId }, JSON.stringify(map));
    const rows = await tx`update meetings set speaker_map_enc = ${enc} where id = ${meetingId} returning id`;
    if (rows.length === 0) throw new NotFoundError("meeting");
  });
}

export async function listMeetingItems(clientId: string, meetingId: string): Promise<ActionItem[]> {
  return withClient(clientId, async (tx, id) => {
    const rows = await tx.unsafe<ItemRow[]>(
      `select ${ITEM_COLUMNS} from action_items where meeting_id = $1 order by created_at, id`, [meetingId]);
    if (rows.length === 0) return [];
    const dek = await clientKey(tx, id);
    return rows.map((r) => decryptItem(dek, id, r));
  });
}

export async function addActionItem(clientId: string, meetingId: string, item: CleanActionItem): Promise<string> {
  return withClient(clientId, async (tx, id) => {
    const [meeting] = await tx<{ project_id: string }[]>`select project_id from meetings where id = ${meetingId}`;
    if (!meeting) throw new NotFoundError("meeting");
    const dek = await clientKey(tx, id);
    return insertItem(tx, dek, id, meeting.project_id, meetingId, item, true);
  });
}

export type ItemUpdate = {
  title?: string;
  owner?: string | null;
  dueDate?: string | null;
  status?: "open" | "done";
  snoozedUntil?: string | null;
};

export async function updateActionItem(clientId: string, itemId: string, u: ItemUpdate): Promise<void> {
  await withClient(clientId, async (tx, id) => {
    const [found] = await tx`select 1 from action_items where id = ${itemId}`;
    if (!found) throw new NotFoundError("action item");
    const dek = await clientKey(tx, id);
    const ref = (column: string) => ({ clientId: id, column, rowId: itemId });
    if (u.title !== undefined) await tx`update action_items set title_enc = ${encryptField(dek, ref(ITEM_TITLE), u.title)}, edited = true where id = ${itemId}`;
    if (u.owner !== undefined) {
      await tx`update action_items set owner_enc = ${u.owner ? encryptField(dek, ref(ITEM_OWNER), u.owner) : null}, edited = true where id = ${itemId}`;
    }
    if (u.dueDate !== undefined) await tx`update action_items set due_date = ${u.dueDate}, edited = true where id = ${itemId}`;
    if (u.snoozedUntil !== undefined) await tx`update action_items set snoozed_until = ${u.snoozedUntil} where id = ${itemId}`;
    if (u.status !== undefined) {
      await tx`update action_items set status = ${u.status},
        closed_at = case when ${u.status} = 'done' then now() else null end where id = ${itemId}`;
    }
  });
}

export async function deleteActionItem(clientId: string, itemId: string): Promise<void> {
  await withClient(clientId, async (tx) => {
    const rows = await tx`delete from action_items where id = ${itemId} returning id`;
    if (rows.length === 0) throw new NotFoundError("action item");
  });
}

export type MeetingListEntry = {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  template: string;
  title: string | null;
  tags: string[];
  openItems: number;
  transcriptExpiresAt: Date | null;
};

/** Meetings for one project, newest first, with their latest summary title. */
export async function listProjectMeetings(clientId: string, projectId: string): Promise<MeetingListEntry[]> {
  return withClient(clientId, async (tx, id) => {
    const rows = await tx<{
      id: string; started_at: Date; ended_at: Date | null; template: string;
      summary_id: string | null; content_enc: string | null; tags: string[] | null;
      open_items: number; expires_at: Date | null;
    }[]>`
      select m.id, m.started_at, m.ended_at, m.template,
        s.id as summary_id, s.content_enc, s.tags,
        (select count(*)::int from action_items a where a.meeting_id = m.id and a.status = 'open') as open_items,
        (select min(expires_at) from transcript_segments t where t.meeting_id = m.id) as expires_at
      from meetings m
      left join lateral (select id, content_enc, tags from summaries where meeting_id = m.id order by version desc limit 1) s on true
      where m.project_id = ${projectId}
      order by m.started_at desc`;
    const dek = rows.some((r) => r.content_enc) ? await clientKey(tx, id) : null;
    return rows.map((r) => ({
      id: r.id,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      template: r.template,
      title: r.content_enc && dek && r.summary_id
        ? (JSON.parse(decryptField(dek, { clientId: id, column: SUMMARY, rowId: r.summary_id }, r.content_enc)) as SummaryContentT).title
        : null,
      tags: r.tags ?? [],
      openItems: r.open_items,
      transcriptExpiresAt: r.expires_at,
    }));
  });
}

export async function getMeetingMeta(clientId: string, meetingId: string) {
  return withClient(clientId, async (tx) => {
    const rows = await tx<{ project_id: string; template: string; started_at: Date; ended_at: Date | null; expires_at: Date | null }[]>`
      select m.project_id, m.template, m.started_at, m.ended_at,
        (select min(expires_at) from transcript_segments t where t.meeting_id = m.id) as expires_at
      from meetings m where m.id = ${meetingId}`;
    if (rows.length === 0) throw new NotFoundError("meeting");
    const r = rows[0];
    return { projectId: r.project_id, template: r.template, startedAt: r.started_at, endedAt: r.ended_at, transcriptExpiresAt: r.expires_at };
  });
}
