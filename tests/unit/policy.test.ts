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
