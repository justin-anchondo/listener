import { db } from "@/lib/db/pool";

/** Deletes expired transcript segments and old audit rows. Returns segments removed. */
export async function purgeExpired(auditDays: number): Promise<number> {
  const rows = await db()<{ removed: number }[]>`select listener.purge_expired(${auditDays}) as removed`;
  return rows[0].removed;
}
