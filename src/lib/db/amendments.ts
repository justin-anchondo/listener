import { randomUUID } from "node:crypto";
import type { SummaryContentT } from "@/lib/assist/schema";
import { decryptField, encryptField } from "@/lib/crypto/keys";
import { audit } from "@/lib/db/audit";
import { NotFoundError, clientKey } from "@/lib/db/keyring";
import { withClient } from "@/lib/db/scoped";
import { AMENDMENT_TEXT } from "@/lib/db/summaries";

// Amendments to a project brief (SPEC 4.4). Text is write once: the app can
// add an amendment and dismiss or restore it, never edit it.

export type Amendment = {
  id: string;
  source: "meeting" | "owner";
  text: string;
  createdAt: Date;
  dismissed: boolean;
  meetingId: string | null;
  meetingTitle: string | null;
  meetingStartedAt: Date | null;
};

export async function listAmendments(clientId: string, projectId: string): Promise<Amendment[]> {
  return withClient(clientId, async (tx, id) => {
    const rows = await tx<{
      id: string; source: "meeting" | "owner"; text_enc: string; created_at: Date; dismissed_at: Date | null;
      meeting_id: string | null; started_at: Date | null; summary_id: string | null; content_enc: string | null;
    }[]>`
      select a.id, a.source, a.text_enc, a.created_at, a.dismissed_at, a.meeting_id, m.started_at,
        s.id as summary_id, s.content_enc
      from brief_amendments a
      left join meetings m on m.id = a.meeting_id
      left join lateral (select id, content_enc from summaries where meeting_id = a.meeting_id order by version desc limit 1) s on true
      where a.project_id = ${projectId}
      order by a.created_at`;
    if (rows.length === 0) return [];
    const dek = await clientKey(tx, id);
    return rows.map((r) => ({
      id: r.id,
      source: r.source,
      text: decryptField(dek, { clientId: id, column: AMENDMENT_TEXT, rowId: r.id }, r.text_enc),
      createdAt: r.created_at,
      dismissed: r.dismissed_at !== null,
      meetingId: r.meeting_id,
      meetingStartedAt: r.started_at,
      meetingTitle: r.summary_id && r.content_enc
        ? (JSON.parse(decryptField(dek, { clientId: id, column: "summaries.content", rowId: r.summary_id }, r.content_enc)) as SummaryContentT).title
        : null,
    }));
  });
}

export async function addOwnerNote(clientId: string, projectId: string, text: string): Promise<string> {
  return withClient(clientId, async (tx, id) => {
    const [p] = await tx`select 1 from projects where id = ${projectId}`;
    if (!p) throw new NotFoundError("project");
    const dek = await clientKey(tx, id);
    const amendId = randomUUID();
    const enc = encryptField(dek, { clientId: id, column: AMENDMENT_TEXT, rowId: amendId }, text);
    await tx`insert into brief_amendments (id, client_id, project_id, source, text_enc)
      values (${amendId}, ${id}, ${projectId}, 'owner', ${enc})`;
    await audit(tx, "brief.note_added", { clientId: id, objectId: projectId });
    return amendId;
  });
}

export async function setAmendmentDismissed(clientId: string, amendmentId: string, dismissed: boolean): Promise<void> {
  await withClient(clientId, async (tx) => {
    const rows = await tx`update brief_amendments set dismissed_at = ${dismissed ? new Date() : null}
      where id = ${amendmentId} returning id`;
    if (rows.length === 0) throw new NotFoundError("amendment");
  });
}
