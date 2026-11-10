import { randomUUID } from "node:crypto";
import { audit } from "@/lib/db/audit";
import { withConnector } from "@/lib/db/scoped";
import type { CodeRow, GrantRow } from "@/lib/policy/connector";

// OAuth state for the Claude connector (SPEC 6.6), in the connector scope.
// Codes and tokens are stored only as hashes; decisions are made by the pure
// rules in policy/connector.

export async function countOAuthClients(): Promise<number> {
  return withConnector(async (tx) => (await tx<{ n: number }[]>`select count(*)::int as n from oauth_clients`)[0].n);
}

export async function registerOAuthClient(c: { id: string; name: string; redirectUris: string[] }): Promise<void> {
  await withConnector(async (tx) => {
    await tx`insert into oauth_clients (id, name, redirect_uris) values (${c.id}, ${c.name}, ${c.redirectUris})`;
    await audit(tx, "connector.registered");
  });
}

export async function getOAuthClient(id: string): Promise<{ id: string; name: string; redirectUris: string[] } | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) return null;
  return withConnector(async (tx) => {
    const [r] = await tx<{ id: string; name: string; redirect_uris: string[] }[]>`select id, name, redirect_uris from oauth_clients where id = ${id}`;
    return r ? { id: r.id, name: r.name, redirectUris: r.redirect_uris } : null;
  });
}

export async function saveCode(c: { codeHash: string; oauthClientId: string; redirectUri: string; codeChallenge: string; expiresAt: Date }): Promise<void> {
  await withConnector(async (tx) => {
    await tx`insert into oauth_codes (code_hash, oauth_client_id, redirect_uri, code_challenge, expires_at)
      values (${c.codeHash}, ${c.oauthClientId}, ${c.redirectUri}, ${c.codeChallenge}, ${c.expiresAt})`;
    await audit(tx, "connector.approved");
  });
}

/**
 * Redeems a code: decide(row) says whether it may be used; if so the code is
 * marked used and a grant is created in the same transaction, so a code can
 * never produce two grants.
 */
export async function redeemCode(
  codeHash: string,
  decide: (row: CodeRow | null) => boolean,
  grant: { accessHash: string; refreshHash: string; accessExpiresAt: Date; refreshExpiresAt: Date },
  now: Date,
): Promise<boolean> {
  return withConnector(async (tx) => {
    const [r] = await tx<{ oauth_client_id: string; redirect_uri: string; code_challenge: string; expires_at: Date; used_at: Date | null }[]>`
      select oauth_client_id, redirect_uri, code_challenge, expires_at, used_at from oauth_codes where code_hash = ${codeHash} for update`;
    const row = r ? { oauthClientId: r.oauth_client_id, redirectUri: r.redirect_uri, codeChallenge: r.code_challenge, expiresAt: r.expires_at, usedAt: r.used_at } : null;
    if (!r || r.used_at) return false; // a code works once, whatever the caller decides
    await tx`update oauth_codes set used_at = ${now} where code_hash = ${codeHash}`;
    if (!decide(row)) return false;
    const id = randomUUID();
    await tx`insert into oauth_grants (id, oauth_client_id, access_hash, refresh_hash, access_expires_at, refresh_expires_at)
      values (${id}, ${row!.oauthClientId}, ${grant.accessHash}, ${grant.refreshHash}, ${grant.accessExpiresAt}, ${grant.refreshExpiresAt})`;
    await audit(tx, "connector.token_issued", { objectId: id });
    return true;
  });
}

type GrantDb = { id: string; access_expires_at: Date; refresh_expires_at: Date; revoked_at: Date | null };
const toGrant = (r: GrantDb): GrantRow => ({ id: r.id, accessExpiresAt: r.access_expires_at, refreshExpiresAt: r.refresh_expires_at, revokedAt: r.revoked_at });

/** The grant for an access token, marking it used. */
export async function grantForAccess(accessHash: string, now: Date): Promise<GrantRow | null> {
  return withConnector(async (tx) => {
    const [r] = await tx<GrantDb[]>`update oauth_grants set last_used_at = ${now} where access_hash = ${accessHash}
      returning id, access_expires_at, refresh_expires_at, revoked_at`;
    return r ? toGrant(r) : null;
  });
}

/** Rotates both tokens when canUse(grant) allows it; the old refresh token stops working. */
export async function rotateGrant(
  refreshHash: string,
  canUse: (g: GrantRow | null) => boolean,
  next: { accessHash: string; refreshHash: string; accessExpiresAt: Date },
): Promise<boolean> {
  return withConnector(async (tx) => {
    const [r] = await tx<GrantDb[]>`select id, access_expires_at, refresh_expires_at, revoked_at from oauth_grants where refresh_hash = ${refreshHash} for update`;
    if (!canUse(r ? toGrant(r) : null)) return false;
    await tx`update oauth_grants set access_hash = ${next.accessHash}, refresh_hash = ${next.refreshHash}, access_expires_at = ${next.accessExpiresAt}
      where id = ${r.id}`;
    await audit(tx, "connector.token_refreshed", { objectId: r.id });
    return true;
  });
}

/** Revokes by either token (RFC 7009); unknown tokens are ignored. */
export async function revokeByToken(tokenHash: string, now: Date): Promise<void> {
  await withConnector(async (tx) => {
    const rows = await tx<{ id: string }[]>`update oauth_grants set revoked_at = ${now}
      where (access_hash = ${tokenHash} or refresh_hash = ${tokenHash}) and revoked_at is null returning id`;
    for (const r of rows) await audit(tx, "connector.revoked", { objectId: r.id });
  });
}

export type Connection = { id: string; toolName: string; createdAt: Date; lastUsedAt: Date | null; refreshExpiresAt: Date };

/** Live connections for the owner's "Connected tools" screen. */
export async function listConnections(now: Date): Promise<Connection[]> {
  return withConnector(async (tx) => {
    const rows = await tx<{ id: string; name: string; created_at: Date; last_used_at: Date | null; refresh_expires_at: Date }[]>`
      select g.id, c.name, g.created_at, g.last_used_at, g.refresh_expires_at
      from oauth_grants g join oauth_clients c on c.id = g.oauth_client_id
      where g.revoked_at is null and g.refresh_expires_at > ${now} order by g.created_at desc`;
    return rows.map((r) => ({ id: r.id, toolName: r.name, createdAt: r.created_at, lastUsedAt: r.last_used_at, refreshExpiresAt: r.refresh_expires_at }));
  });
}

export async function revokeConnection(id: string, now: Date): Promise<boolean> {
  return withConnector(async (tx) => {
    const rows = await tx`update oauth_grants set revoked_at = ${now} where id = ${id} and revoked_at is null returning id`;
    if (rows.length) await audit(tx, "connector.revoked", { objectId: id });
    return rows.length === 1;
  });
}

/** One row per tool call: the event, the client, and the meeting id. Never content. */
export async function auditToolCall(tool: string, grantId: string, clientId: string | null, objectId: string | null): Promise<void> {
  await withConnector(async (tx) => {
    await audit(tx, `connector.tool.${tool}`, { clientId: clientId ?? undefined, objectId: objectId ?? grantId });
  });
}
