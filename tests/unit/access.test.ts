import { describe, expect, it } from "vitest";
import { checkAccessCode, isGateConfigured, signSession, verifySession } from "@/lib/policy/access";

const CODE = "correct horse battery staple";
const HOUR = 3_600_000;

describe("access gate", () => {
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

  it("verifies a fresh session", () => {
    const now = 1_800_000_000_000;
    expect(verifySession(CODE, signSession(CODE, now), now + HOUR, 12 * HOUR)).toBe(true);
  });

  it("rejects expired, future dated, and missing sessions", () => {
    const now = 1_800_000_000_000;
    const cookie = signSession(CODE, now);
    expect(verifySession(CODE, cookie, now + 13 * HOUR, 12 * HOUR)).toBe(false);
    expect(verifySession(CODE, signSession(CODE, now + HOUR), now, 12 * HOUR)).toBe(false);
    expect(verifySession(CODE, undefined, now, 12 * HOUR)).toBe(false);
  });

  it("rejects tampered sessions", () => {
    const now = 1_800_000_000_000;
    const [, sig] = signSession(CODE, now).split(".");
    expect(verifySession(CODE, `${now + 1}.${sig}`, now + 2, 12 * HOUR)).toBe(false);
    expect(verifySession(CODE, `${now}.${sig}x`, now, 12 * HOUR)).toBe(false);
    expect(verifySession(CODE, `${now}.${sig}.extra`, now, 12 * HOUR)).toBe(false);
    expect(verifySession(CODE, "garbage", now, 12 * HOUR)).toBe(false);
  });

  it("ends all sessions when the code changes", () => {
    const now = 1_800_000_000_000;
    expect(verifySession("a different long code", signSession(CODE, now), now, 12 * HOUR)).toBe(false);
  });
});
