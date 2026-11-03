import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// Envelope encryption (SPEC 6.2). Each client has a random data key (DEK).
// DEKs are stored only wrapped by the master key, which lives in the server
// environment and never in the database. Every field is AES-256-GCM with a
// fresh nonce, and is bound to its client, column, and row through the
// additional authenticated data, so a ciphertext copied to another row or
// client fails to decrypt.

const ALGO = "aes-256-gcm";
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const VERSION = "v1";

export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CryptoError";
  }
}

export function parseMasterKey(value: string | undefined): Buffer {
  if (!value) throw new CryptoError("LISTENER_MASTER_KEY is not set");
  const key = Buffer.from(value, "base64");
  if (key.length !== KEY_BYTES) throw new CryptoError("LISTENER_MASTER_KEY must be 32 bytes, base64 encoded");
  return key;
}

/** Derives a separate key for a non encryption purpose, such as signing session cookies. */
export function deriveKey(masterKey: Buffer, purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", masterKey, Buffer.alloc(0), `listener:${purpose}`, KEY_BYTES));
}

function seal(key: Buffer, plaintext: Buffer, aad: string): string {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGO, key, nonce);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return `${VERSION}:${Buffer.concat([nonce, body, cipher.getAuthTag()]).toString("base64")}`;
}

function open(key: Buffer, sealed: string, aad: string): Buffer {
  const [version, payload, ...rest] = sealed.split(":");
  if (version !== VERSION || !payload || rest.length) throw new CryptoError("unknown ciphertext format");
  const raw = Buffer.from(payload, "base64");
  if (raw.length < NONCE_BYTES + TAG_BYTES) throw new CryptoError("ciphertext too short");
  const nonce = raw.subarray(0, NONCE_BYTES);
  const tag = raw.subarray(raw.length - TAG_BYTES);
  const body = raw.subarray(NONCE_BYTES, raw.length - TAG_BYTES);
  const decipher = createDecipheriv(ALGO, key, nonce);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    throw new CryptoError("decryption failed");
  }
}

export function generateDataKey(): Buffer {
  return randomBytes(KEY_BYTES);
}

export function wrapDataKey(masterKey: Buffer, dek: Buffer, clientId: string): string {
  return seal(masterKey, dek, `dek|${clientId}`);
}

export function unwrapDataKey(masterKey: Buffer, wrapped: string, clientId: string): Buffer {
  const dek = open(masterKey, wrapped, `dek|${clientId}`);
  if (dek.length !== KEY_BYTES) throw new CryptoError("bad data key length");
  return dek;
}

/** Where a field lives. All three parts are bound into the ciphertext. */
export type FieldRef = { clientId: string; column: string; rowId: string };

function fieldAad({ clientId, column, rowId }: FieldRef): string {
  return `field|${clientId}|${column}|${rowId}`;
}

export function encryptField(dek: Buffer, ref: FieldRef, plaintext: string): string {
  return seal(dek, Buffer.from(plaintext, "utf8"), fieldAad(ref));
}

export function decryptField(dek: Buffer, ref: FieldRef, sealed: string): string {
  return open(dek, sealed, fieldAad(ref)).toString("utf8");
}
