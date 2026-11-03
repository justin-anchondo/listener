import { generateDataKey, parseMasterKey, unwrapDataKey, wrapDataKey } from "@/lib/crypto/keys";
import type { Tx } from "@/lib/db/scoped";

export function masterKey(): Buffer {
  return parseMasterKey(process.env.LISTENER_MASTER_KEY);
}

export function newWrappedKey(clientId: string): { dek: Buffer; wrapped: string } {
  const dek = generateDataKey();
  return { dek, wrapped: wrapDataKey(masterKey(), dek, clientId) };
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}

/** Loads and unwraps the data key of the client the transaction is scoped to. */
export async function clientKey(tx: Tx, clientId: string): Promise<Buffer> {
  const rows = await tx<{ wrapped_dek: string }[]>`select wrapped_dek from clients where id = ${clientId}`;
  if (rows.length === 0) throw new NotFoundError("client");
  return unwrapDataKey(masterKey(), rows[0].wrapped_dek, clientId);
}
