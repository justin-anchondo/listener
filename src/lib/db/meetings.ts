import { randomUUID } from "node:crypto";
import { decryptField, encryptField } from "@/lib/crypto/keys";
import { audit } from "@/lib/db/audit";
import { NotFoundError, clientKey } from "@/lib/db/keyring";
import { withClient } from "@/lib/db/scoped";
import type { SegmentInput } from "@/lib/policy/limits";
import { computeExpiresAt } from "@/lib/policy/retention";

const SEGMENT_TEXT = "transcript_segments.text";

export async function startMeeting(clientId: string, projectId: string, template: string): Promise<string> {
  const meetingId = randomUUID();
  await withClient(clientId, async (tx, id) => {
    // The composite foreign key rejects a project that belongs to another client.
    await tx`insert into meetings (id, client_id, project_id, template) values (${meetingId}, ${id}, ${projectId}, ${template})`;
    await audit(tx, "meeting.started", { clientId: id, objectId: meetingId });
  });
  return meetingId;
}

/**
 * Stores final segments encrypted. Retries are safe: a segment with a seq
 * already stored for this meeting is skipped. Returns the number inserted.
 */
export async function saveSegments(
  clientId: string,
  meetingId: string,
  segments: SegmentInput[],
  retentionDays: number,
  now = new Date(),
): Promise<number> {
  return withClient(clientId, async (tx, id) => {
    const meeting = await tx<{ ended_at: Date | null }[]>`select ended_at from meetings where id = ${meetingId}`;
    if (meeting.length === 0) throw new NotFoundError("meeting");
    const dek = await clientKey(tx, id);
    const expiresAt = computeExpiresAt(meeting[0].ended_at ?? now, retentionDays);
    const rows = segments.map((s) => {
      const rowId = randomUUID();
      return {
        id: rowId,
        client_id: id,
        meeting_id: meetingId,
        seq: s.seq,
        speaker: s.speaker,
        start_ms: s.startMs,
        end_ms: s.endMs,
        text_enc: encryptField(dek, { clientId: id, column: SEGMENT_TEXT, rowId }, s.text),
        expires_at: expiresAt,
      };
    });
    const inserted = await tx`insert into transcript_segments ${tx(rows)} on conflict (meeting_id, seq) do nothing returning id`;
    return inserted.length;
  });
}

/** Marks the meeting ended and sets its transcript to expire relative to the end (SPEC 5). */
export async function endMeeting(clientId: string, meetingId: string, retentionDays: number, now = new Date()): Promise<void> {
  await withClient(clientId, async (tx, id) => {
    const rows = await tx<{ ended_at: Date }[]>`
      update meetings set ended_at = coalesce(ended_at, ${now}) where id = ${meetingId} returning ended_at`;
    if (rows.length === 0) throw new NotFoundError("meeting");
    const expiresAt = computeExpiresAt(rows[0].ended_at, retentionDays);
    await tx`update transcript_segments set expires_at = ${expiresAt} where meeting_id = ${meetingId}`;
    await audit(tx, "meeting.ended", { clientId: id, objectId: meetingId });
  });
}

export type StoredSegment = { seq: number; speaker: number | null; startMs: number; endMs: number; text: string };

export async function loadTranscript(clientId: string, meetingId: string): Promise<StoredSegment[]> {
  return withClient(clientId, async (tx, id) => {
    const rows = await tx<{ id: string; seq: number; speaker: number | null; start_ms: number; end_ms: number; text_enc: string }[]>`
      select id, seq, speaker, start_ms, end_ms, text_enc from transcript_segments
      where meeting_id = ${meetingId} order by seq`;
    if (rows.length === 0) return [];
    const dek = await clientKey(tx, id);
    return rows.map((r) => ({
      seq: r.seq,
      speaker: r.speaker,
      startMs: r.start_ms,
      endMs: r.end_ms,
      text: decryptField(dek, { clientId: id, column: SEGMENT_TEXT, rowId: r.id }, r.text_enc),
    }));
  });
}
