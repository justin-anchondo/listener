import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// SPEC 6.1. Sign in is by passkey. The access code (LISTENER_ACCESS_CODE)
// only unlocks enrollment of the first passkey. Sessions are signed cookies
// with an absolute lifetime and an idle timeout that activity extends.

export const SESSION_COOKIE = "listener_session";
export const CHALLENGE_COOKIE = "listener_challenge";

/** A missing or short code refuses enrollment rather than opening it. */
export function isGateConfigured(code: string | undefined, minLength: number): code is string {
  return typeof code === "string" && code.length >= minLength;
}

/** Constant time comparison that does not leak the length of the expected code. */
export function checkAccessCode(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function mac(key: Buffer, payload: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

function macMatches(key: Buffer, payload: string, sig: string): boolean {
  const expected = Buffer.from(mac(key, payload));
  const actual = Buffer.from(sig);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export type Session = { issuedAtMs: number; seenAtMs: number };
export type SessionLimits = { maxAgeMs: number; idleMs: number };

export function signSession(key: Buffer, s: Session): string {
  const payload = `s1.${s.issuedAtMs}.${s.seenAtMs}`;
  return `${payload}.${mac(key, payload)}`;
}

export function verifySession(key: Buffer, value: string | undefined, nowMs: number, limits: SessionLimits): Session | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "s1") return null;
  const [, issued, seen, sig] = parts;
  if (!/^\d+$/.test(issued) || !/^\d+$/.test(seen)) return null;
  if (!macMatches(key, `s1.${issued}.${seen}`, sig)) return null;
  const issuedAtMs = Number(issued);
  const seenAtMs = Number(seen);
  if (issuedAtMs > nowMs || seenAtMs > nowMs || seenAtMs < issuedAtMs) return null;
  if (nowMs - issuedAtMs > limits.maxAgeMs) return null;
  if (nowMs - seenAtMs > limits.idleMs) return null;
  return { issuedAtMs, seenAtMs };
}

/** True when enough time has passed that the cookie should be reissued with a new seen time. */
export function shouldRefresh(s: Session, nowMs: number, refreshMs: number): boolean {
  return nowMs - s.seenAtMs >= refreshMs;
}

export type ChallengePurpose = "enroll" | "login" | "pair";

export function newChallenge(): string {
  return randomBytes(32).toString("base64url");
}

export function signChallenge(key: Buffer, purpose: ChallengePurpose, challenge: string, expiresAtMs: number): string {
  const payload = `c1.${purpose}.${expiresAtMs}.${challenge}`;
  return `${payload}.${mac(key, payload)}`;
}

/** Returns the challenge if the cookie is authentic, unexpired, and for this purpose. */
export function verifyChallenge(key: Buffer, value: string | undefined, purpose: ChallengePurpose, nowMs: number): string | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 5 || parts[0] !== "c1") return null;
  const [, p, exp, challenge, sig] = parts;
  if (p !== purpose || !/^\d+$/.test(exp) || !/^[A-Za-z0-9_-]+$/.test(challenge)) return null;
  if (!macMatches(key, `c1.${p}.${exp}.${challenge}`, sig)) return null;
  if (Number(exp) < nowMs) return null;
  return challenge;
}
