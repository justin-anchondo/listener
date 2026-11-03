import { withAuth } from "@/lib/db/scoped";

export type StoredPasskey = { id: string; publicKey: Uint8Array; counter: number; transports: string[] };

export async function countPasskeys(): Promise<number> {
  return withAuth(async (tx) => {
    const rows = await tx<{ n: number }[]>`select count(*)::int as n from passkeys`;
    return rows[0].n;
  });
}

export async function listPasskeyIds(): Promise<{ id: string; transports: string[] }[]> {
  return withAuth((tx) => tx<{ id: string; transports: string[] }[]>`select id, transports from passkeys`);
}

export async function getPasskey(id: string): Promise<StoredPasskey | null> {
  return withAuth(async (tx) => {
    const rows = await tx<{ id: string; public_key: Buffer; counter: string; transports: string[] }[]>`
      select id, public_key, counter, transports from passkeys where id = ${id}`;
    if (rows.length === 0) return null;
    const r = rows[0];
    return { id: r.id, publicKey: new Uint8Array(r.public_key), counter: Number(r.counter), transports: r.transports };
  });
}

export async function savePasskey(p: StoredPasskey): Promise<void> {
  await withAuth(async (tx) => {
    await tx`insert into passkeys (id, public_key, counter, transports)
      values (${p.id}, ${Buffer.from(p.publicKey)}, ${p.counter}, ${p.transports})`;
    await tx`insert into audit_log (event) values ('passkey.enrolled')`;
  });
}

export async function markPasskeyUsed(id: string, counter: number): Promise<void> {
  await withAuth(async (tx) => {
    await tx`update passkeys set counter = ${counter}, last_used_at = now() where id = ${id}`;
  });
}
