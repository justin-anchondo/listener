import { describe, expect, it } from "vitest";
import { LimitError, cleanName, cleanSegments, cleanText } from "@/lib/policy/limits";
import { redact } from "@/lib/policy/redact";
import { computeExpiresAt, isPurgeable } from "@/lib/policy/retention";
import { ScopeError, assertClientScope, assertSameClient, isUuid } from "@/lib/policy/scope";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("client scope", () => {
  it("accepts a well formed id", () => {
    expect(assertClientScope(A.toUpperCase())).toBe(A);
    expect(isUuid(A)).toBe(true);
  });

  it("rejects missing or malformed scope", () => {
    for (const bad of [undefined, null, "", "abc", 123, `${A}x`, "' or 1=1 --"]) {
      expect(() => assertClientScope(bad)).toThrow(ScopeError);
    }
  });

  it("rejects a row from another client", () => {
    expect(() => assertSameClient(A, B)).toThrow(ScopeError);
    expect(() => assertSameClient(A, A.toUpperCase())).not.toThrow();
  });
});

describe("retention", () => {
  it("expires 30 days after the given time", () => {
    const end = new Date("2026-11-03T15:00:00Z");
    expect(computeExpiresAt(end, 30).toISOString()).toBe("2026-12-03T15:00:00.000Z");
  });

  it("refuses non positive retention", () => {
    expect(() => computeExpiresAt(new Date(), 0)).toThrow();
    expect(() => computeExpiresAt(new Date(), -1)).toThrow();
  });

  it("purges at or after expiry only", () => {
    const exp = new Date("2026-12-03T15:00:00Z");
    expect(isPurgeable(exp, new Date("2026-12-03T14:59:59Z"))).toBe(false);
    expect(isPurgeable(exp, exp)).toBe(true);
  });
});

describe("redact", () => {
  it("keeps ids, codes, and counts", () => {
    expect(redact({ event: "segments.saved", meetingId: A, count: 3, status: 200 })).toEqual({
      event: "segments.saved",
      meetingId: A,
      count: 3,
      status: 200,
    });
  });

  it("drops unknown keys such as text, name, or body", () => {
    expect(redact({ event: "x", text: "secret pricing", name: "Acme", body: { a: 1 } })).toEqual({ event: "x" });
  });

  it("redacts free text even under an allowed key", () => {
    expect(redact({ code: "We agreed on 40k for phase one" })).toEqual({ code: "[redacted]" });
  });

  it("drops objects and arrays under allowed keys", () => {
    expect(redact({ segments: [{ text: "hi" }], count: 1 })).toEqual({ count: 1 });
  });
});

describe("limits", () => {
  it("cleans names", () => {
    expect(cleanName("  Acme   Corp ", 120)).toBe("Acme Corp");
    expect(() => cleanName("   ", 120)).toThrow(LimitError);
    expect(() => cleanName("x".repeat(121), 120)).toThrow(LimitError);
    expect(() => cleanName(5, 120)).toThrow(LimitError);
  });

  it("cleans optional text", () => {
    expect(cleanText(undefined, 10)).toBeNull();
    expect(cleanText("  ", 10)).toBeNull();
    expect(cleanText("brief", 10)).toBe("brief");
    expect(() => cleanText("x".repeat(11), 10)).toThrow(LimitError);
  });

  it("validates segment batches", () => {
    const ok = { seq: 0, speaker: 1, startMs: 0, endMs: 900, text: "Hello" };
    expect(cleanSegments([ok, { ...ok, seq: 1, speaker: null }], 200, 5000)).toHaveLength(2);
    expect(() => cleanSegments([], 200, 5000)).toThrow(LimitError);
    expect(() => cleanSegments([ok, ok, ok], 2, 5000)).toThrow(LimitError);
    expect(() => cleanSegments([{ ...ok, text: "" }], 200, 5000)).toThrow(LimitError);
    expect(() => cleanSegments([{ ...ok, text: "x".repeat(5001) }], 200, 5000)).toThrow(LimitError);
    expect(() => cleanSegments([{ ...ok, endMs: -1 }], 200, 5000)).toThrow(LimitError);
    expect(() => cleanSegments([{ ...ok, seq: 1.5 }], 200, 5000)).toThrow(LimitError);
    expect(() => cleanSegments("nope", 200, 5000)).toThrow(LimitError);
  });
});

import { cleanDate, cleanList, cleanSpeakerMap } from "@/lib/policy/limits";
import { cleanEditedSummary } from "@/lib/assist/edit";

describe("phase 3 limits", () => {
  it("validates dates", () => {
    expect(cleanDate("2026-11-06")).toBe("2026-11-06");
    expect(cleanDate("")).toBeNull();
    expect(cleanDate(null)).toBeNull();
    expect(() => cleanDate("2026-02-30")).toThrow(LimitError);
    expect(() => cleanDate("tomorrow")).toThrow(LimitError);
  });

  it("validates speaker maps and allows one Me", () => {
    expect(cleanSpeakerMap({ "0": " Me ", "1": "Dana  Lee", "2": "" }, 80)).toEqual({ "0": "Me", "1": "Dana Lee" });
    expect(() => cleanSpeakerMap({ "0": "Me", "1": "Me" }, 80)).toThrow(LimitError);
    expect(() => cleanSpeakerMap({ x: "Dana" }, 80)).toThrow(LimitError);
    expect(() => cleanSpeakerMap(["Me"], 80)).toThrow(LimitError);
  });

  it("validates lists", () => {
    expect(cleanList([" a ", "", "b"], 5, 10)).toEqual(["a", "b"]);
    expect(() => cleanList(["a", "b"], 1, 10)).toThrow(LimitError);
    expect(() => cleanList([1], 5, 10)).toThrow(LimitError);
  });

  it("validates an edited summary and keeps only allowed tags", () => {
    const l = { maxListItems: 5, maxItemChars: 100, maxFreeTags: 2, allowedTags: ["pricing"] };
    const r = cleanEditedSummary({
      content: { title: "T", summary: "S", main_points: ["p"], decisions: [], key_quotes: [{ quote: "q", speaker: "Dana", at_ms: 10 }], feedback: { suggestions: ["s"] }, free_tags: ["x"] },
      tags: ["pricing", "nope"],
    }, l);
    expect(r.tags).toEqual(["pricing"]);
    expect(r.content.title).toBe("T");
    expect(r.content.feedback.suggestions).toEqual(["s"]);
    expect(() => cleanEditedSummary({ content: { title: "" } }, l)).toThrow(LimitError);
    expect(() => cleanEditedSummary({ content: { title: "T", key_quotes: [{ quote: "q", speaker: "s", at_ms: -1 }] } }, l)).toThrow(LimitError);
  });
});

import { cleanLogo, cleanWatchFor, meetingTypeKey } from "@/lib/policy/limits";

describe("logos and meeting types", () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
  const url = (mime: string, b: Buffer) => `data:${mime};base64,${b.toString("base64")}`;

  it("accepts a real PNG within the size limit", () => {
    expect(cleanLogo(url("image/png", png), 1000)).toEqual({ mime: "image/png", base64: png.toString("base64") });
  });

  it("refuses SVG, mismatched bytes, oversize files, and junk", () => {
    expect(() => cleanLogo(url("image/svg+xml", Buffer.from("<svg onload=alert(1)>")), 1000)).toThrow(LimitError);
    expect(() => cleanLogo(url("image/jpeg", png), 1000)).toThrow(LimitError);
    expect(() => cleanLogo(url("image/png", png), 10)).toThrow(LimitError);
    expect(() => cleanLogo("not a data url", 1000)).toThrow(LimitError);
    expect(() => cleanLogo(42, 1000)).toThrow(LimitError);
  });

  it("derives stable meeting type keys", () => {
    expect(meetingTypeKey("Status update")).toBe("status_update");
    expect(meetingTypeKey("  Q&A / Demo!! ")).toBe("q_a_demo");
    expect(meetingTypeKey("***")).toBe("type");
  });

  it("cleans watch-for lists", () => {
    expect(cleanWatchFor([" budget ", "budget", "next  steps", ""], 10, 60)).toEqual(["budget", "next steps"]);
    expect(() => cleanWatchFor(["x".repeat(61)], 10, 60)).toThrow(LimitError);
  });
});

describe("live window and recall question limits", () => {
  it("accepts a window, drops empty lines, and keeps the newest text under the cap", async () => {
    const { cleanLiveWindow } = await import("@/lib/policy/limits");
    const lines = [
      { speaker: 0, startMs: 0, text: "aaaa" },
      { speaker: 1, startMs: 10, text: "  " },
      { speaker: null, startMs: 20, text: "bbbb" },
      { speaker: 1, startMs: 30, text: "cccc" },
    ];
    expect(cleanLiveWindow(lines, 10, 100, 8).map((l) => l.text)).toEqual(["bbbb", "cccc"]);
    expect(cleanLiveWindow(lines, 10, 100, 1000)).toHaveLength(3);
  });
  it("rejects malformed or oversized windows", async () => {
    const { cleanLiveWindow, LimitError } = await import("@/lib/policy/limits");
    expect(() => cleanLiveWindow("x", 10, 100, 100)).toThrow(LimitError);
    expect(() => cleanLiveWindow(Array(11).fill({ speaker: 0, startMs: 0, text: "a" }), 10, 100, 100)).toThrow(LimitError);
    expect(() => cleanLiveWindow([{ speaker: -1, startMs: 0, text: "a" }], 10, 100, 100)).toThrow(LimitError);
    expect(() => cleanLiveWindow([{ speaker: 0, startMs: 0, text: "a".repeat(101) }], 10, 100, 100)).toThrow(LimitError);
  });
  it("bounds recall questions", async () => {
    const { cleanQuestion, LimitError } = await import("@/lib/policy/limits");
    expect(cleanQuestion("  what  did we agree? ", 50)).toBe("what did we agree?");
    expect(() => cleanQuestion("", 50)).toThrow(LimitError);
    expect(() => cleanQuestion("x".repeat(51), 50)).toThrow(LimitError);
  });
});

describe("suggestion retention", () => {
  it("pinned cards never expire; unpinned follow the meeting end, or now while running", async () => {
    const { suggestionExpiresAt } = await import("@/lib/policy/retention");
    const now = new Date("2026-11-04T12:00:00Z");
    const ended = new Date("2026-11-01T12:00:00Z");
    expect(suggestionExpiresAt(true, ended, now, 30)).toBeNull();
    expect(suggestionExpiresAt(false, ended, now, 30)?.toISOString()).toBe("2026-12-01T12:00:00.000Z");
    expect(suggestionExpiresAt(false, null, now, 30)?.toISOString()).toBe("2026-12-04T12:00:00.000Z");
  });
});

describe("redact for live checks", () => {
  it("keeps the live check reason, found flag, and cache counts, but no text", () => {
    expect(redact({ event: "live.checked", reason: "question", cacheRead: 1200, found: false, text: "secret words", answer: "x" }))
      .toEqual({ event: "live.checked", reason: "question", cacheRead: 1200, found: false });
    expect(redact({ reason: "they said the budget is 40k" })).toEqual({ reason: "[redacted]" });
  });
});
