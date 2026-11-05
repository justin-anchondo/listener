import { describe, expect, it } from "vitest";
import { isFollowable, parseAfterSeq } from "@/lib/follow";

describe("isFollowable", () => {
  const now = new Date("2026-11-05T12:00:00Z");
  it("follows running meetings that started recently", () => {
    expect(isFollowable(new Date("2026-11-05T11:30:00Z"), null, now, 6)).toBe(true);
  });
  it("ignores ended, stale, or future meetings", () => {
    expect(isFollowable(new Date("2026-11-05T11:30:00Z"), new Date("2026-11-05T11:50:00Z"), now, 6)).toBe(false);
    expect(isFollowable(new Date("2026-11-05T05:00:00Z"), null, now, 6)).toBe(false);
    expect(isFollowable(new Date("2026-11-05T12:05:00Z"), null, now, 6)).toBe(false);
  });
});

describe("parseAfterSeq", () => {
  it("accepts a cursor and falls back to the start for anything else", () => {
    expect(parseAfterSeq("41")).toBe(41);
    expect(parseAfterSeq(null)).toBe(-1);
    expect(parseAfterSeq("-7")).toBe(-1);
    expect(parseAfterSeq("1.5")).toBe(-1);
    expect(parseAfterSeq("x")).toBe(-1);
  });
});
