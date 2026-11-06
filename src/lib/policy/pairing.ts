import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

// SPEC 6.1: signing in on a computer by approving it from the signed in
// phone. The computer shows a short code and keeps a random secret in an
// httpOnly cookie; the phone approves the code after a fresh passkey check;
// the computer then claims a session with the secret. Requests expire fast
// and work once.

export const PAIR_COOKIE = "listener_pair";

// No 0/O or 1/I/L, so the code is easy to read off one screen and type on another.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

export type PairingRow = {
  id: string;
  code: string;
  claimHash: string;
  expiresAt: Date;
  approvedAt: Date | null;
  claimedAt: Date | null;
};

export type PairingState = "pending" | "approved" | "claimed" | "expired";

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** A new request: id, display code, the computer's secret (never stored), its hash, and expiry. */
export function newPairing(now: Date, ttlSeconds: number, rand: (n: number) => Buffer = randomBytes) {
  const bytes = rand(CODE_LENGTH);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[bytes[i] % ALPHABET.length];
  const secret = rand(32).toString("base64url");
  return { id: randomUUID(), code, secret, claimHash: hashSecret(secret), expiresAt: new Date(now.getTime() + ttlSeconds * 1000) };
}

/** "K7QM4F2X" -> "K7QM-4F2X" for display. */
export function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Accepts what a person types ("k7qm 4f2x", "K7QM-4F2X"); returns the stored form or null. */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const c = input.toUpperCase().replace(/[\s-]/g, "");
  if (c.length !== CODE_LENGTH) return null;
  for (const ch of c) if (!ALPHABET.includes(ch)) return null;
  return c;
}

export function pairingState(p: PairingRow, now: Date): PairingState {
  if (p.claimedAt) return "claimed";
  if (p.expiresAt.getTime() <= now.getTime()) return "expired";
  return p.approvedAt ? "approved" : "pending";
}

/** Only a pending, unexpired request can be approved. */
export function canApprove(p: PairingRow, now: Date): boolean {
  return pairingState(p, now) === "pending";
}

/** The computer that started the request can claim it once, after approval and before expiry. */
export function canClaim(p: PairingRow, secret: string | null | undefined, now: Date): boolean {
  if (!secret || pairingState(p, now) !== "approved") return false;
  const a = Buffer.from(hashSecret(secret));
  const b = Buffer.from(p.claimHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Refuses new requests while too many are still waiting, so the table can't be flooded. */
export function tooManyPending(pending: number, max: number): boolean {
  return pending >= max;
}

/** Cookie value "id.secret"; returns null for anything malformed. */
export function parsePairCookie(value: string | undefined): { id: string; secret: string } | null {
  if (!value) return null;
  const m = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/.exec(value);
  return m ? { id: m[1], secret: m[2] } : null;
}

/** A short, non identifying description of the asking browser for the approval screen. */
export function describeDevice(userAgent: string | null): string {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "A browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : /iPhone|iPad/.test(ua) ? "iOS" : null;
  return os ? `${browser} on ${os}` : browser;
}
