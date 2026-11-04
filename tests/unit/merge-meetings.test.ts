import { describe, expect, it } from "vitest";
import { MergeError, isMergeCandidate, planMerge } from "@/lib/policy/merge";

const at = (hhmm: string) => new Date(`2026-11-04T${hhmm}:00Z`);
const HOUR = 3_600_000;
const a = { id: "a", startedAt: at("09:00"), endedAt: at("09:20"), hasTranscript: true };
const b = { id: "b", startedAt: at("09:23"), endedAt: at("09:55"), hasTranscript: true };

describe("planMerge", () => {
  it("keeps the earlier meeting and shifts the later one's times after it", () => {
    const plan = { keep: "a", drop: "b", offsetMs: 23 * 60_000, endedAt: at("09:55") };
    expect(planMerge(a, b, 4 * HOUR)).toEqual(plan);
    expect(planMerge(b, a, 4 * HOUR)).toEqual(plan);
  });

  it("keeps the later end when the first recording ran longer", () => {
    expect(planMerge({ ...a, endedAt: at("10:30") }, b, 4 * HOUR).endedAt).toEqual(at("10:30"));
  });

  it("refuses the same meeting, a running meeting, an expired transcript, or meetings too far apart", () => {
    const reason = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        return e instanceof MergeError ? e.reason : "other";
      }
      return "merged";
    };
    expect(reason(() => planMerge(a, a, HOUR))).toBe("same_meeting");
    expect(reason(() => planMerge(a, { ...b, endedAt: null }, HOUR))).toBe("running");
    expect(reason(() => planMerge(a, { ...b, hasTranscript: false }, HOUR))).toBe("no_transcript");
    expect(reason(() => planMerge(a, { ...b, startedAt: at("14:00"), endedAt: at("14:30") }, 4 * HOUR))).toBe("too_far_apart");
    expect(reason(() => planMerge(a, { ...b, startedAt: at("13:20"), endedAt: at("13:40") }, 4 * HOUR))).toBe("merged");
  });

  it("offers only mergeable meetings as candidates", () => {
    expect(isMergeCandidate(a, b, HOUR)).toBe(true);
    expect(isMergeCandidate(a, { ...b, hasTranscript: false }, HOUR)).toBe(false);
  });
});
