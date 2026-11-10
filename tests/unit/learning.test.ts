import { describe, expect, it } from "vitest";
import { preferencesBlock } from "@/lib/assist/preferences";
import { LimitError } from "@/lib/policy/limits";
import { cleanFeedbackReason, feedbackExpiresAt } from "@/lib/policy/feedback";

describe("feedback reasons", () => {
  it("accepts only fixed reasons for each kind, or none", () => {
    expect(cleanFeedbackReason("task", "not_mine")).toBe("not_mine");
    expect(cleanFeedbackReason("tip", "already_known")).toBe("already_known");
    expect(cleanFeedbackReason("task", undefined)).toBeNull();
    expect(() => cleanFeedbackReason("task", "already_known")).toThrow(LimitError);
    expect(() => cleanFeedbackReason("tip", "Dana said so")).toThrow(LimitError);
  });
  it("expires tip feedback with the transcript and task feedback later", () => {
    const now = new Date("2026-11-10T00:00:00Z");
    expect(feedbackExpiresAt("tip", now, { task: 180, tip: 30 }).toISOString()).toBe("2026-12-10T00:00:00.000Z");
    expect(feedbackExpiresAt("task", now, { task: 180, tip: 30 }).toISOString()).toBe("2027-05-09T00:00:00.000Z");
  });
});

describe("preferencesBlock", () => {
  it("lists this client's removed and kept items and general habits from counts", () => {
    const text = preferencesBlock(
      "task",
      { removed: [{ text: "Book the venue", reason: "not_mine" }, { text: "Think about pricing", reason: "too_vague" }], kept: ["Send the proposal"] },
      [
        { signal: "removed", reason: "not_a_task", n: 12 },
        { signal: "removed", reason: "not_mine", n: 2 },
        { signal: "completed", reason: null, n: 40 },
      ],
      3,
    );
    expect(text).toContain('- "Book the venue" (not the owner\'s task)');
    expect(text).toContain('- "Think about pricing" (too vague)');
    expect(text).toContain('- "Send the proposal"');
    expect(text).toContain("not a real task (12 times)");
    expect(text).not.toContain("not the owner's task (2 times)");
  });
  it("is empty with no feedback yet", () => {
    expect(preferencesBlock("tip", { removed: [], kept: [] }, [], 3)).toBe("");
  });
});
