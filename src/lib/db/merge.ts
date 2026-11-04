import { randomUUID } from "node:crypto";
import type { SpeakerMap } from "@/lib/assist/stats";
import { decryptField, encryptField } from "@/lib/crypto/keys";
import { audit } from "@/lib/db/audit";
import { NotFoundError, clientKey } from "@/lib/db/keyring";
import { expireSuggestionsFrom } from "@/lib/db/live";
import { withClient } from "@/lib/db/scoped";
import { type MergeSide, isMergeCandidate, planMerge } from "@/lib/policy/merge";
import { computeExpiresAt } from "@/lib/policy/retention";

// Joins two recordings of one call (after a disconnect) into the earlier
// meeting, inside one client's scope. Encrypted fields whose additional data
// names the row are re-encrypted when they move to new rows.

const SPEAKERS = "meetings.speaker_map";
const SUMMARY = "summaries.content";
const PROJECT_NAME = "projects.name";
const AMENDMENT_TEXT = "brief_amendments.text";
const SUGGESTION_TEXT = "suggestions.text";

type MeetingRow = { id: string; project_id: string; started_at: Date; ended_at: Date | null; speaker_map_enc: string | null; has_transcript: boolean };

const side = (m: MeetingRow): MergeSide => ({ id: m.id, startedAt: m.started_at, endedAt: m.ended_at, hasTranscript: m.has_transcript });

export type MergeCandidate = { id: string; title: string | null; projectName: string; startedAt: Date; endedAt: Date | null };

/** This client's other meetings close enough in time to merge with meetingId. */
export async function listMergeCandidates(clientId: string, meetingId: string, windowMs: number): Promise<MergeCandidate[]> {
  return withClient(clientId, async (tx, id) => {
    const rows = await tx<(MeetingRow & { project_name: string; summary_id: string | null; content_enc: string | null })[]>`
      select m.id, m.project_id, m.started_at, m.ended_at, m.speaker_map_enc, p.name_enc as project_name,
        exists (select 1 from transcript_segments t where t.meeting_id = m.id) as has_transcript,
        s.id as summary_id, s.content_enc
      from meetings m
      join projects p on p.id = m.project_id
      left join lateral (select id, content_enc from summaries where meeting_id = m.id order by version desc limit 1) s on true
      order by m.started_at`;
    const self = rows.find((r) => r.id === meetingId);
    if (!self) throw new NotFoundError("meeting");
    const others = rows.filter((r) => r.id !== meetingId && isMergeCandidate(side(self), side(r), windowMs));
    if (others.length === 0) return [];
    const dek = await clientKey(tx, id);
    return others.map((r) => ({
      id: r.id,
      title: r.summary_id && r.content_enc
        ? ((JSON.parse(decryptField(dek, { clientId: id, column: SUMMARY, rowId: r.summary_id }, r.content_enc)) as { title?: string }).title ?? null)
        : null,
      projectName: decryptField(dek, { clientId: id, column: PROJECT_NAME, rowId: r.project_id }, r.project_name),
      startedAt: r.started_at,
      endedAt: r.ended_at,
    }));
  });
}

/**
 * Merges two meetings of one client. The earlier one is kept: the later
 * one's transcript follows on in time, and its action items, brief
 * amendments, and live cards move over. The later meeting and its summaries
 * are then deleted; the caller regenerates the kept meeting's summary.
 */
export async function mergeMeetings(
  clientId: string,
  meetingA: string,
  meetingB: string,
  opts: { windowMs: number; transcriptDays: number; suggestionDays: number },
): Promise<{ keep: string; drop: string; segments: number }> {
  return withClient(clientId, async (tx, id) => {
    const rows = await tx<MeetingRow[]>`
      select m.id, m.project_id, m.started_at, m.ended_at, m.speaker_map_enc,
        exists (select 1 from transcript_segments t where t.meeting_id = m.id) as has_transcript
      from meetings m where m.id in (${meetingA}, ${meetingB}) for update`;
    const a = rows.find((r) => r.id === meetingA);
    const b = rows.find((r) => r.id === meetingB);
    if (!a || !b) throw new NotFoundError("meeting");
    const plan = planMerge(side(a), side(b), opts.windowMs);
    const keep = plan.keep === a.id ? a : b;
    const drop = plan.keep === a.id ? b : a;
    const dek = await clientKey(tx, id);

    // Transcript: renumber after the kept meeting's lines and shift onto its timeline.
    const [{ next }] = await tx<{ next: number }[]>`
      select coalesce(max(seq), -1)::int + 1 as next from transcript_segments where meeting_id = ${keep.id}`;
    const [{ first }] = await tx<{ first: number }[]>`
      select coalesce(min(seq), 0)::int as first from transcript_segments where meeting_id = ${drop.id}`;
    const moved = await tx`
      update transcript_segments set meeting_id = ${keep.id}, seq = seq - ${first} + ${next},
        start_ms = start_ms + ${plan.offsetMs}, end_ms = end_ms + ${plan.offsetMs}
      where meeting_id = ${drop.id} returning id`;

    // Speaker names: the kept meeting's names win; the other fills gaps.
    const readMap = (m: MeetingRow): SpeakerMap =>
      m.speaker_map_enc ? (JSON.parse(decryptField(dek, { clientId: id, column: SPEAKERS, rowId: m.id }, m.speaker_map_enc)) as SpeakerMap) : {};
    const map = { ...readMap(drop), ...readMap(keep) };
    const mapEnc = Object.keys(map).length ? encryptField(dek, { clientId: id, column: SPEAKERS, rowId: keep.id }, JSON.stringify(map)) : null;
    await tx`update meetings set ended_at = ${plan.endedAt}, speaker_map_enc = ${mapEnc} where id = ${keep.id}`;

    // Action items keep their own rows, so their encryption stays valid.
    await tx`update action_items set meeting_id = ${keep.id}, project_id = ${keep.project_id},
      source_ms = case when source_ms is null then null else source_ms + ${plan.offsetMs} end
      where meeting_id = ${drop.id}`;

    // Amendment text is write once: copy to new rows, then remove the originals.
    const amendments = await tx<{ id: string; source: string; text_enc: string; created_at: Date; dismissed_at: Date | null }[]>`
      select id, source, text_enc, created_at, dismissed_at from brief_amendments where meeting_id = ${drop.id}`;
    for (const r of amendments) {
      const newId = randomUUID();
      const text = decryptField(dek, { clientId: id, column: AMENDMENT_TEXT, rowId: r.id }, r.text_enc);
      await tx`insert into brief_amendments (id, client_id, project_id, meeting_id, source, text_enc, created_at, dismissed_at)
        values (${newId}, ${id}, ${keep.project_id}, ${keep.id}, ${r.source}, ${encryptField(dek, { clientId: id, column: AMENDMENT_TEXT, rowId: newId }, text)},
          ${r.created_at}, ${r.dismissed_at})`;
    }
    await tx`delete from brief_amendments where meeting_id = ${drop.id}`;

    // Live cards: same approach, with times shifted.
    const cards = await tx<{ id: string; kind: string; text_enc: string; source_ms: number | null; pinned: boolean; dismissed: boolean; created_at: Date }[]>`
      select id, kind, text_enc, source_ms, pinned, dismissed, created_at from suggestions where meeting_id = ${drop.id}`;
    for (const r of cards) {
      const newId = randomUUID();
      const text = decryptField(dek, { clientId: id, column: SUGGESTION_TEXT, rowId: r.id }, r.text_enc);
      await tx`insert into suggestions (id, client_id, meeting_id, kind, text_enc, source_ms, pinned, dismissed, expires_at, created_at)
        values (${newId}, ${id}, ${keep.id}, ${r.kind}, ${encryptField(dek, { clientId: id, column: SUGGESTION_TEXT, rowId: newId }, text)},
          ${r.source_ms === null ? null : r.source_ms + plan.offsetMs}, ${r.pinned}, ${r.dismissed},
          ${r.pinned ? null : computeExpiresAt(plan.endedAt, opts.suggestionDays)}, ${r.created_at})`;
    }
    await tx`delete from suggestions where meeting_id = ${drop.id}`;

    // Everything now expires from the merged meeting's end.
    await tx`update transcript_segments set expires_at = ${computeExpiresAt(plan.endedAt, opts.transcriptDays)} where meeting_id = ${keep.id}`;
    await expireSuggestionsFrom(tx, keep.id, plan.endedAt, opts.suggestionDays);

    // The later meeting and its summaries go; the kept meeting is resummarized.
    await tx`delete from meetings where id = ${drop.id}`;
    await audit(tx, "meeting.merged", { clientId: id, objectId: keep.id, count: moved.length });
    return { keep: keep.id, drop: drop.id, segments: moved.length };
  });
}
