import { describe, expect, it } from "vitest";
import { parseResult } from "@/lib/stt/results";

function results(words: { w: string; s: number; e: number; sp?: number }[], opts: { final?: boolean; transcript?: string } = {}) {
  return {
    type: "Results",
    is_final: opts.final ?? true,
    start: 10,
    duration: 3,
    channel: {
      alternatives: [{
        transcript: opts.transcript ?? words.map((x) => x.w).join(" "),
        words: words.map((x) => ({ word: x.w.toLowerCase(), punctuated_word: x.w, start: x.s, end: x.e, speaker: x.sp })),
      }],
    },
  };
}

describe("parseResult", () => {
  it("ignores non result messages", () => {
    expect(parseResult({ type: "Metadata" })).toBeNull();
    expect(parseResult(null)).toBeNull();
    expect(parseResult("Results")).toBeNull();
  });

  it("groups consecutive words by speaker", () => {
    const r = parseResult(results([
      { w: "Hi", s: 10, e: 10.3, sp: 0 },
      { w: "there.", s: 10.3, e: 10.7, sp: 0 },
      { w: "Hello.", s: 11, e: 11.5, sp: 1 },
      { w: "Okay.", s: 12, e: 12.4, sp: 0 },
    ]))!;
    expect(r.segments).toEqual([
      { speaker: 0, text: "Hi there.", startSec: 10, endSec: 10.7 },
      { speaker: 1, text: "Hello.", startSec: 11, endSec: 11.5 },
      { speaker: 0, text: "Okay.", startSec: 12, endSec: 12.4 },
    ]);
    expect(r.isFinal).toBe(true);
    expect(r.audioEndSec).toBe(13);
  });

  it("returns no segments for silence", () => {
    expect(parseResult(results([], { transcript: "  " }))!.segments).toEqual([]);
  });

  it("falls back to the transcript when words are missing", () => {
    const msg = results([], { transcript: "hello world" });
    const r = parseResult(msg)!;
    expect(r.segments).toEqual([{ speaker: null, text: "hello world", startSec: 10, endSec: 13 }]);
  });

  it("marks interim results", () => {
    expect(parseResult(results([{ w: "Hi", s: 10, e: 10.2, sp: 0 }], { final: false }))!.isFinal).toBe(false);
  });
});
