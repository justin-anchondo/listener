import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  checkAccessCode,
  isGateConfigured,
  newChallenge,
  shouldRefresh,
  signChallenge,
  signSession,
  verifyChallenge,
  verifySession,
} from "@/lib/policy/access";

const CODE = "correct horse battery staple";
const key = randomBytes(32);
const MIN = 60_000;
const HOUR = 60 * MIN;
const limits = { maxAgeMs: 12 * HOUR, idleMs: 30 * MIN };
const t0 = 1_800_000_000_000;

describe("access code", () => {
  it("is closed when the code is missing or too short", () => {
    expect(isGateConfigured(undefined, 12)).toBe(false);
    expect(isGateConfigured("short", 12)).toBe(false);
    expect(isGateConfigured(CODE, 12)).toBe(true);
  });

  it("accepts only the exact code", () => {
    expect(checkAccessCode(CODE, CODE)).toBe(true);
    expect(checkAccessCode(CODE + " ", CODE)).toBe(false);
    expect(checkAccessCode("", CODE)).toBe(false);
  });
});

describe("sessions", () => {
  it("accepts a fresh session", () => {
    const cookie = signSession(key, { issuedAtMs: t0, seenAtMs: t0 });
    expect(verifySession(key, cookie, t0 + MIN, limits)).toEqual({ issuedAtMs: t0, seenAtMs: t0 });
  });

  it("expires after the idle window without activity", () => {
    const cookie = signSession(key, { issuedAtMs: t0, seenAtMs: t0 });
    expect(verifySession(key, cookie, t0 + 31 * MIN, limits)).toBeNull();
  });

  it("stays valid with activity but not past the absolute lifetime", () => {
    const recent = signSession(key, { issuedAtMs: t0, seenAtMs: t0 + 11 * HOUR });
    expect(verifySession(key, recent, t0 + 11 * HOUR + MIN, limits)).not.toBeNull();
    const old = signSession(key, { issuedAtMs: t0, seenAtMs: t0 + 12 * HOUR });
    expect(verifySession(key, old, t0 + 12 * HOUR + MIN, limits)).toBeNull();
  });

  it("rejects tampering, other keys, future times, and garbage", () => {
    const cookie = signSession(key, { issuedAtMs: t0, seenAtMs: t0 });
    const [, , , sig] = cookie.split(".");
    expect(verifySession(key, `s1.${t0}.${t0 + 5 * MIN}.${sig}`, t0 + 6 * MIN, limits)).toBeNull();
    expect(verifySession(randomBytes(32), cookie, t0, limits)).toBeNull();
    expect(verifySession(key, signSession(key, { issuedAtMs: t0 + HOUR, seenAtMs: t0 + HOUR }), t0, limits)).toBeNull();
    expect(verifySession(key, "garbage", t0, limits)).toBeNull();
    expect(verifySession(key, undefined, t0, limits)).toBeNull();
  });

  it("refreshes only after the refresh interval", () => {
    expect(shouldRefresh({ issuedAtMs: t0, seenAtMs: t0 }, t0 + 30_000, 60_000)).toBe(false);
    expect(shouldRefresh({ issuedAtMs: t0, seenAtMs: t0 }, t0 + 60_000, 60_000)).toBe(true);
  });
});

describe("passkey challenges", () => {
  it("round trips for the right purpose before expiry", () => {
    const c = newChallenge();
    const cookie = signChallenge(key, "login", c, t0 + 5 * MIN);
    expect(verifyChallenge(key, cookie, "login", t0)).toBe(c);
  });

  it("rejects the wrong purpose, expiry, and tampering", () => {
    const c = newChallenge();
    const cookie = signChallenge(key, "enroll", c, t0 + 5 * MIN);
    expect(verifyChallenge(key, cookie, "login", t0)).toBeNull();
    expect(verifyChallenge(key, cookie, "enroll", t0 + 6 * MIN)).toBeNull();
    expect(verifyChallenge(key, cookie.replace(c, newChallenge()), "enroll", t0)).toBeNull();
    expect(verifyChallenge(randomBytes(32), cookie, "enroll", t0)).toBeNull();
  });
});
