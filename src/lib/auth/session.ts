import { cookies, headers } from "next/headers";
import { loadConfig } from "@/lib/config";
import { deriveKey } from "@/lib/crypto/keys";
import { masterKey } from "@/lib/db/keyring";
import {
  CHALLENGE_COOKIE,
  SESSION_COOKIE,
  type ChallengePurpose,
  newChallenge,
  shouldRefresh,
  signChallenge,
  signSession,
  verifyChallenge,
  verifySession,
} from "@/lib/policy/access";

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}

function keys() {
  const master = masterKey();
  return { session: deriveKey(master, "session"), challenge: deriveKey(master, "challenge") };
}

function limits() {
  const { security } = loadConfig();
  return {
    maxAgeMs: security.session_max_hours * 3_600_000,
    idleMs: security.session_idle_minutes * 60_000,
    refreshMs: security.session_refresh_seconds * 1000,
  };
}

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: Math.floor(maxAgeSeconds),
  };
}

/** For server components: true when a valid session cookie is present. Never refreshes. */
export async function hasSession(): Promise<boolean> {
  const jar = await cookies();
  return verifySession(keys().session, jar.get(SESSION_COOKIE)?.value, Date.now(), limits()) !== null;
}

/** For route handlers: throws UnauthorizedError, and extends the idle window on activity. */
export async function requireSession(): Promise<void> {
  const jar = await cookies();
  const now = Date.now();
  const l = limits();
  const key = keys().session;
  const session = verifySession(key, jar.get(SESSION_COOKIE)?.value, now, l);
  if (!session) throw new UnauthorizedError();
  if (shouldRefresh(session, now, l.refreshMs)) {
    jar.set(SESSION_COOKIE, signSession(key, { issuedAtMs: session.issuedAtMs, seenAtMs: now }), cookieOptions(l.maxAgeMs / 1000));
  }
}

export async function startSession(): Promise<void> {
  const jar = await cookies();
  const now = Date.now();
  jar.set(SESSION_COOKIE, signSession(keys().session, { issuedAtMs: now, seenAtMs: now }), cookieOptions(limits().maxAgeMs / 1000));
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function issueChallenge(purpose: ChallengePurpose): Promise<string> {
  const challenge = newChallenge();
  const ttl = loadConfig().security.passkey_challenge_seconds;
  const jar = await cookies();
  jar.set(CHALLENGE_COOKIE, signChallenge(keys().challenge, purpose, challenge, Date.now() + ttl * 1000), cookieOptions(ttl));
  return challenge;
}

/** Returns the pending challenge for this purpose and clears it so it can't be replayed. */
export async function takeChallenge(purpose: ChallengePurpose): Promise<string | null> {
  const jar = await cookies();
  const challenge = verifyChallenge(keys().challenge, jar.get(CHALLENGE_COOKIE)?.value, purpose, Date.now());
  jar.delete(CHALLENGE_COOKIE);
  return challenge;
}

/** Relying party for passkeys: the site's own host. LISTENER_ORIGIN pins it when set. */
export async function relyingParty(): Promise<{ rpID: string; origin: string }> {
  const pinned = process.env.LISTENER_ORIGIN;
  if (pinned) {
    const url = new URL(pinned);
    return { rpID: url.hostname, origin: url.origin };
  }
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;
  return { rpID: new URL(origin).hostname, origin };
}
