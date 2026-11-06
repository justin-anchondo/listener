import { audit } from "@/lib/db/audit";
import { withAuth } from "@/lib/db/scoped";
import type { PairingRow } from "@/lib/policy/pairing";

// Computer sign in requests (SPEC 6.1), in the auth scope: no client data is
// visible here. Decisions are made by the pure rules in policy/pairing.

type Row = { id: string; code: string; claim_hash: string; device: string; expires_at: Date; approved_at: Date | null; claimed_at: Date | null };

const toPairing = (r: Row): PairingRow & { device: string } => ({
  id: r.id, code: r.code, claimHash: r.claim_hash, device: r.device, expiresAt: r.expires_at, approvedAt: r.approved_at, claimedAt: r.claimed_at,
});

export async function countPendingPairings(now: Date): Promise<number> {
  return withAuth(async (tx) => {
    const [r] = await tx<{ n: number }[]>`select count(*)::int as n from pairings where approved_at is null and claimed_at is null and expires_at > ${now}`;
    return r.n;
  });
}

export async function createPairing(p: { id: string; code: string; claimHash: string; device: string; expiresAt: Date }): Promise<void> {
  await withAuth(async (tx) => {
    await tx`insert into pairings (id, code, claim_hash, device, expires_at) values (${p.id}, ${p.code}, ${p.claimHash}, ${p.device}, ${p.expiresAt})`;
    await audit(tx, "pairing.created", { objectId: p.id });
  });
}

/** The newest unexpired request with this code, if any. */
export async function findPairingByCode(code: string, now: Date) {
  return withAuth(async (tx) => {
    const [r] = await tx<Row[]>`select id, code, claim_hash, device, expires_at, approved_at, claimed_at from pairings
      where code = ${code} and expires_at > ${now} order by created_at desc limit 1`;
    return r ? toPairing(r) : null;
  });
}

export async function getPairing(id: string) {
  return withAuth(async (tx) => {
    const [r] = await tx<Row[]>`select id, code, claim_hash, device, expires_at, approved_at, claimed_at from pairings where id = ${id}`;
    return r ? toPairing(r) : null;
  });
}

/** Marks approved if still pending; false when someone got there first or it expired. */
export async function markPairingApproved(id: string, now: Date): Promise<boolean> {
  return withAuth(async (tx) => {
    const rows = await tx`update pairings set approved_at = ${now}
      where id = ${id} and approved_at is null and claimed_at is null and expires_at > ${now} returning id`;
    if (rows.length) await audit(tx, "pairing.approved", { objectId: id });
    return rows.length === 1;
  });
}

/** Marks claimed exactly once; false if it was already claimed. */
export async function markPairingClaimed(id: string, now: Date): Promise<boolean> {
  return withAuth(async (tx) => {
    const rows = await tx`update pairings set claimed_at = ${now}
      where id = ${id} and approved_at is not null and claimed_at is null and expires_at > ${now} returning id`;
    if (rows.length) await audit(tx, "pairing.claimed", { objectId: id });
    return rows.length === 1;
  });
}
