import type { Tx } from "@/lib/db/scoped";

/** Writes an audit row. Ids, an event name, and a count only (SPEC 6.5). */
export async function audit(
  tx: Tx,
  event: string,
  ref: { clientId?: string; objectId?: string; count?: number } = {},
): Promise<void> {
  await tx`insert into audit_log (event, client_id, object_id, count)
    values (${event}, ${ref.clientId ?? null}, ${ref.objectId ?? null}, ${ref.count ?? null})`;
}
