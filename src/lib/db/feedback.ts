import { randomUUID } from "node:crypto";
import type { ClientFeedback, ReasonCount } from "@/lib/assist/preferences";
import { decryptField, encryptField } from "@/lib/crypto/keys";
import { clientKey } from "@/lib/db/keyring";
import { type Tx, withClient, withStats } from "@/lib/db/scoped";
import { type FeedbackKind, type FeedbackReason, feedbackExpiresAt } from "@/lib/policy/feedback";

// What the owner did with tasks and tips, per client, so prompts can learn
// from it. Text is encrypted with the client's key.

const FEEDBACK_TEXT = "feedback.text";
const UNDEFINED_TABLE = "42P01"; // migration 0008 not applied yet

export type FeedbackDays = { task: number; tip: number };
export type FeedbackSignal = "removed" | "completed" | "edited" | "pinned";

/**
 * Records feedback inside the caller's client transaction. Runs in a
 * savepoint so a database without migration 0008 still completes the
 * owner's action; it just doesn't learn from it.
 */
export async function insertFeedback(
  tx: Tx, dek: Buffer, clientId: string,
  f: { kind: FeedbackKind; sourceId: string; signal: FeedbackSignal; reason: FeedbackReason | null; text: string | null },
  days: FeedbackDays,
): Promise<void> {
  const id = randomUUID();
  const textEnc = f.text ? encryptField(dek, { clientId, column: FEEDBACK_TEXT, rowId: id }, f.text) : null;
  await tx.savepoint(async (sp) => {
    // One row per task or tip and signal: a reason given after the fact replaces the first one.
    await sp`delete from feedback where source_id = ${f.sourceId} and signal = ${f.signal}`;
    await sp`
      insert into feedback (id, client_id, kind, source_id, signal, reason, text_enc, expires_at)
      values (${id}, ${clientId}, ${f.kind}, ${f.sourceId}, ${f.signal}, ${f.reason}, ${textEnc}, ${feedbackExpiresAt(f.kind, new Date(), days)})`;
  })
    .catch((err: { code?: string }) => {
      if (err.code !== UNDEFINED_TABLE) throw err;
    });
}

/** This client's recent removed items (with reasons) and kept ones. */
export async function loadClientFeedback(clientId: string, kind: FeedbackKind, limit: number): Promise<ClientFeedback> {
  if (limit <= 0) return { removed: [], kept: [] };
  return withClient(clientId, async (tx, id) => {
    const rows = await tx.savepoint((sp) => sp<{ id: string; signal: FeedbackSignal; reason: string | null; text_enc: string | null }[]>`
      select id, signal, reason, text_enc from feedback
      where kind = ${kind} and expires_at > now() and text_enc is not null
      order by created_at desc limit ${limit * 3}`)
      .catch((err: { code?: string }) => {
        if (err.code === UNDEFINED_TABLE) return [];
        throw err;
      });
    if (rows.length === 0) return { removed: [], kept: [] };
    const dek = await clientKey(tx, id);
    const text = (r: { id: string; text_enc: string | null }) => decryptField(dek, { clientId: id, column: FEEDBACK_TEXT, rowId: r.id }, r.text_enc!);
    return {
      removed: rows.filter((r) => r.signal === "removed").slice(0, limit).map((r) => ({ text: text(r), reason: r.reason })),
      kept: rows.filter((r) => r.signal !== "removed").slice(0, Math.ceil(limit / 2)).map(text),
    };
  });
}

/** Reason counts across clients: numbers only, never text (SPEC 6.3). */
export async function loadReasonCounts(kind: FeedbackKind): Promise<ReasonCount[]> {
  return withStats(async (tx) => {
    const rows = await tx.savepoint((sp) => sp<{ signal: string; reason: string | null; n: number }[]>`
      select signal, reason, n from feedback_reason_counts(${kind})`)
      .catch((err: { code?: string }) => {
        if (err.code === "42883" || err.code === UNDEFINED_TABLE) return []; // function missing before 0008
        throw err;
      });
    return rows.map((r) => ({ signal: r.signal, reason: r.reason, n: r.n }));
  });
}
