import type { SummaryContentT } from "@/lib/assist/schema";
import { decryptField, unwrapDataKey } from "@/lib/crypto/keys";
import { masterKey } from "@/lib/db/keyring";
import { withDirectory, withOpenItems, withRecent } from "@/lib/db/scoped";
import { isFollowable } from "@/lib/follow";

// Recent meetings across clients for the Meetings tab (SPEC 6.3). Shows the
// generated title, participants, client, project, and date. Display only:
// nothing here is ever sent to a model.

export type RecentMeeting = {
  id: string;
  clientId: string;
  clientName: string;
  logoVersion: number | null;
  projectId: string;
  projectName: string;
  template: string;
  startedAt: Date;
  endedAt: Date | null;
  title: string | null;
  participants: string[];
  openItems: number;
};

/** Names of the people on a call: the summary's list plus named speakers, without the owner. */
export function participantNames(summaryParticipants: string[], speakerMap: Record<string, string>): string[] {
  const seen = new Map<string, string>();
  for (const name of [...summaryParticipants, ...Object.values(speakerMap)]) {
    const n = name.trim();
    if (!n || n.toLowerCase() === "me") continue;
    if (!seen.has(n.toLowerCase())) seen.set(n.toLowerCase(), n);
  }
  return [...seen.values()];
}

export async function listRecentMeetings(limit: number, clientId?: string, projectId?: string): Promise<RecentMeeting[]> {
  const dir = await withDirectory(async (tx) => ({
    clients: await tx<{ id: string; name_enc: string; wrapped_dek: string; logo_updated_at: Date | null }[]>`
      select id, name_enc, wrapped_dek, case when logo_enc is null then null else logo_updated_at end as logo_updated_at from clients`,
    projects: await tx<{ id: string; client_id: string; name_enc: string }[]>`select id, client_id, name_enc from projects`,
  }));
  const rows = await withRecent((tx) => tx<{
    id: string; client_id: string; project_id: string; template: string; started_at: Date; ended_at: Date | null;
    speaker_map_enc: string | null; summary_id: string | null; content_enc: string | null;
  }[]>`
    select m.id, m.client_id, m.project_id, m.template, m.started_at, m.ended_at, m.speaker_map_enc,
      s.id as summary_id, s.content_enc
    from meetings m
    left join lateral (select id, content_enc from summaries where meeting_id = m.id order by version desc limit 1) s on true
    where (${clientId ?? null}::uuid is null or m.client_id = ${clientId ?? null}::uuid)
      and (${projectId ?? null}::uuid is null or m.project_id = ${projectId ?? null}::uuid)
    order by m.started_at desc
    limit ${limit}`);
  const open = await withOpenItems((tx) => tx<{ meeting_id: string; n: number }[]>`
    select meeting_id, count(*)::int as n from action_items where status = 'open' and meeting_id is not null group by meeting_id`);
  const openBy = new Map(open.map((o) => [o.meeting_id, o.n]));

  const master = masterKey();
  const clients = new Map(dir.clients.map((c) => {
    const dek = unwrapDataKey(master, c.wrapped_dek, c.id);
    return [c.id, { dek, logo: c.logo_updated_at, name: decryptField(dek, { clientId: c.id, column: "clients.name", rowId: c.id }, c.name_enc) }];
  }));
  const projectNames = new Map(dir.projects.map((p) => [p.id, { clientId: p.client_id, enc: p.name_enc }]));

  return rows.flatMap((r) => {
    const c = clients.get(r.client_id);
    const p = projectNames.get(r.project_id);
    if (!c || !p) return [];
    const content = r.summary_id && r.content_enc
      ? (JSON.parse(decryptField(c.dek, { clientId: r.client_id, column: "summaries.content", rowId: r.summary_id }, r.content_enc)) as SummaryContentT)
      : null;
    const speakerMap = r.speaker_map_enc
      ? (JSON.parse(decryptField(c.dek, { clientId: r.client_id, column: "meetings.speaker_map", rowId: r.id }, r.speaker_map_enc)) as Record<string, string>)
      : {};
    return [{
      id: r.id,
      clientId: r.client_id,
      clientName: c.name,
      logoVersion: c.logo ? c.logo.getTime() : null,
      projectId: r.project_id,
      projectName: decryptField(c.dek, { clientId: r.client_id, column: "projects.name", rowId: r.project_id }, p.enc),
      template: r.template,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      title: content?.title ?? null,
      participants: participantNames(content?.participants ?? [], speakerMap),
      openItems: openBy.get(r.id) ?? 0,
    }];
  });
}

export type ActiveMeeting = { id: string; clientId: string; clientName: string; logoVersion: number | null; projectName: string; template: string; startedAt: Date; liveTips: boolean };

/**
 * Meetings being recorded right now, for a second screen to follow. Part of
 * the recent meetings view (SPEC 6.3): names and times only, display only.
 */
export async function listActiveMeetings(now: Date, maxHours: number): Promise<ActiveMeeting[]> {
  const since = new Date(now.getTime() - maxHours * 3_600_000);
  const rows = await withRecent((tx) => tx<{ id: string; client_id: string; project_id: string; template: string; started_at: Date; ended_at: Date | null; live_tips: boolean }[]>`
    select id, client_id, project_id, template, started_at, ended_at, live_tips from meetings
    where ended_at is null and started_at >= ${since} and started_at <= ${now}
    order by started_at desc`);
  if (rows.length === 0) return [];
  const dir = await withDirectory(async (tx) => ({
    clients: await tx<{ id: string; name_enc: string; wrapped_dek: string; logo_updated_at: Date | null }[]>`
      select id, name_enc, wrapped_dek, case when logo_enc is null then null else logo_updated_at end as logo_updated_at from clients`,
    projects: await tx<{ id: string; name_enc: string }[]>`select id, name_enc from projects`,
  }));
  const master = masterKey();
  const projects = new Map(dir.projects.map((p) => [p.id, p.name_enc]));
  const clients = new Map(dir.clients.map((c) => [c.id, c]));
  return rows.flatMap((r) => {
    const c = clients.get(r.client_id);
    const p = projects.get(r.project_id);
    if (!c || !p || !isFollowable(r.started_at, r.ended_at, now, maxHours)) return [];
    const dek = unwrapDataKey(master, c.wrapped_dek, c.id);
    return [{
      id: r.id, clientId: r.client_id, template: r.template, startedAt: r.started_at, liveTips: r.live_tips,
      clientName: decryptField(dek, { clientId: c.id, column: "clients.name", rowId: c.id }, c.name_enc),
      logoVersion: c.logo_updated_at ? c.logo_updated_at.getTime() : null,
      projectName: decryptField(dek, { clientId: c.id, column: "projects.name", rowId: r.project_id }, p),
    }];
  });
}
