import { describe, expect, it } from "vitest";
import { mergeEntries } from "@/lib/capture/merge";
import type { TranscriptEntry } from "@/lib/capture/session";

const seg = (id: number, speaker: number | null, text: string, atSec: number, endSec: number): TranscriptEntry =>
  ({ kind: "segment", id, speaker, text, atSec, endSec });

describe("mergeEntries", () => {
  it("joins same speaker lines separated by short pauses", () => {
    const out = mergeEntries([seg(1, 5, "Let me check", 10, 11), seg(2, 5, "with the team.", 12, 13)], 8);
    expect(out).toEqual([seg(1, 5, "Let me check with the team.", 10, 13)]);
  });

  it("keeps lines from different speakers apart", () => {
    expect(mergeEntries([seg(1, 0, "Hi", 0, 1), seg(2, 1, "Hello", 1, 2)], 8)).toHaveLength(2);
  });

  it("starts a new paragraph after a long pause", () => {
    expect(mergeEntries([seg(1, 0, "One", 0, 1), seg(2, 0, "Two", 10, 11)], 8)).toHaveLength(2);
  });

  it("never merges across a gap marker", () => {
    const gap: TranscriptEntry = { kind: "gap", id: 2, atSec: 1, seconds: 2, reason: "reconnect" };
    expect(mergeEntries([seg(1, 0, "One", 0, 1), gap, seg(3, 0, "Two", 3, 4)], 8)).toHaveLength(3);
  });

  it("does not modify the input", () => {
    const input = [seg(1, 0, "a", 0, 1), seg(2, 0, "b", 1, 2)];
    mergeEntries(input, 8);
    expect(input).toHaveLength(2);
  });
});
