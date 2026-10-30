import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Phase 1 access gate: one long passphrase in LISTENER_ACCESS_CODE unlocks a
// signed, expiring session cookie. Replaced by passkeys in Phase 2.

export const SESSION_COOKIE = "listener_session";

/** A gate with a missing or short code refuses everyone rather than opening. */
export function isGateConfigured(code: string | undefined, minLength: number): code is string {
  return typeof code === "string" && code.length >= minLength;
}

/** Constant time comparison that does not leak the length of the expected code. */
export function checkAccessCode(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// Derived from the access code, so changing the code ends every session.
function sessionKey(code: string): Buffer {
  return createHash("sha256").update(`listener-session-v1:${code}`).digest();
}

function mac(code: string, issuedAtMs: number): string {
  return createHmac("sha256", sessionKey(code)).update(String(issuedAtMs)).digest("base64url");
}

export function signSession(code: string, issuedAtMs: number): string {
  return `${issuedAtMs}.${mac(code, issuedAtMs)}`;
}

export function verifySession(
  code: string,
  value: string | undefined,
  nowMs: number,
  maxAgeMs: number,
): boolean {
  if (!value) return false;
  const [issued, sig, ...rest] = value.split(".");
  if (rest.length > 0 || !issued || !sig || !/^\d+$/.test(issued)) return false;
  const issuedAtMs = Number(issued);
  if (issuedAtMs > nowMs || nowMs - issuedAtMs > maxAgeMs) return false;
  const expected = Buffer.from(mac(code, issuedAtMs));
  const actual = Buffer.from(sig);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
