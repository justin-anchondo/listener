import { describe, expect, it } from "vitest";
import {
  type PairingRow, canApprove, canClaim, describeDevice, formatCode, hashSecret, newPairing, normalizeCode, pairingState, parsePairCookie, tooManyPending,
} from "@/lib/policy/pairing";

const now = new Date("2026-11-06T10:00:00Z");
const later = (s: number) => new Date(now.getTime() + s * 1000);

function row(over: Partial<PairingRow> = {}, secret = "s".repeat(43)): PairingRow {
  return { id: "11111111-1111-4111-8111-111111111111", code: "K7QM4F2X", claimHash: hashSecret(secret), expiresAt: later(120), approvedAt: null, claimedAt: null, ...over };
}

describe("pairing codes", () => {
  it("makes readable codes, a secret, and its hash", () => {
    const p = newPairing(now, 120);
    expect(p.code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(p.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(p.claimHash).toBe(hashSecret(p.secret));
    expect(p.expiresAt).toEqual(later(120));
    expect(newPairing(now, 120).code).not.toBe(p.code);
  });

  it("formats and normalizes what people type", () => {
    expect(formatCode("K7QM4F2X")).toBe("K7QM-4F2X");
    expect(normalizeCode(" k7qm-4f2x ")).toBe("K7QM4F2X");
    expect(normalizeCode("k7qm 4f2x")).toBe("K7QM4F2X");
    expect(normalizeCode("K7QM4F2")).toBeNull();
    expect(normalizeCode("K7QM4F2O")).toBeNull(); // O is never used
    expect(normalizeCode(42)).toBeNull();
  });
});

describe("approving and claiming", () => {
  it("moves pending -> approved -> claimed, and expires", () => {
    expect(pairingState(row(), now)).toBe("pending");
    expect(pairingState(row({ approvedAt: now }), now)).toBe("approved");
    expect(pairingState(row({ approvedAt: now, claimedAt: now }), now)).toBe("claimed");
    expect(pairingState(row(), later(120))).toBe("expired");
  });

  it("approves only pending requests", () => {
    expect(canApprove(row(), now)).toBe(true);
    expect(canApprove(row({ approvedAt: now }), now)).toBe(false);
    expect(canApprove(row(), later(121))).toBe(false);
  });

  it("lets only the starting computer claim, once, after approval and before expiry", () => {
    const secret = "a".repeat(43);
    const approved = row({ approvedAt: now }, secret);
    expect(canClaim(approved, secret, now)).toBe(true);
    expect(canClaim(approved, "b".repeat(43), now)).toBe(false);
    expect(canClaim(approved, null, now)).toBe(false);
    expect(canClaim(row({}, secret), secret, now)).toBe(false);
    expect(canClaim({ ...approved, claimedAt: now }, secret, now)).toBe(false);
    expect(canClaim(approved, secret, later(121))).toBe(false);
  });

  it("caps waiting requests", () => {
    expect(tooManyPending(4, 5)).toBe(false);
    expect(tooManyPending(5, 5)).toBe(true);
  });
});

describe("cookie and device", () => {
  it("parses only well formed cookies", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(parsePairCookie(`${id}.${"a".repeat(43)}`)).toEqual({ id, secret: "a".repeat(43) });
    expect(parsePairCookie(`${id}.short`)).toBeNull();
    expect(parsePairCookie(undefined)).toBeNull();
    expect(parsePairCookie("nonsense")).toBeNull();
  });

  it("describes the browser without identifying details", () => {
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 Edg/131.0")).toBe("Edge on Windows");
    expect(describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15")).toBe("Safari on Mac");
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0) Chrome/131.0 Safari/537.36")).toBe("Chrome on Windows");
    expect(describeDevice(null)).toBe("A browser");
  });
});
