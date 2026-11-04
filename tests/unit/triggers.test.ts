import { describe, expect, it } from "vitest";
import { briefTerms, detectTrigger, shouldCheck } from "@/lib/assist/triggers";

const ctx = { ownerNames: ["Justin"], terms: ["budget", "migration", "pain points"] };

describe("detectTrigger", () => {
  it("fires on questions to the owner", () => {
    expect(detectTrigger("Justin, when can we see the designs?", ctx)).toBe("question");
    expect(detectTrigger("Okay. Can you send the deck over?", ctx)).toBe("question");
    expect(detectTrigger("What did your team think of it?", ctx)).toBe("question");
  });

  it("does not treat rhetorical or third party questions as questions to the owner", () => {
    expect(detectTrigger("Is it raining there?", { ...ctx, terms: [] })).toBeNull();
    expect(detectTrigger("Did Dana approve it?", { ...ctx, terms: [] })).toBeNull();
  });

  it("fires on commitments and dates", () => {
    for (const s of [
      "I'll send the proposal over.",
      "We will get back to you on that.",
      "Can we have it by Friday",
      "Launch is March 3rd.",
      "Let's aim for the 14th of June",
      "The deadline is tight.",
      "next week works",
      "by end of the month",
    ]) expect([s, detectTrigger(s, { ...ctx, terms: [] })]).toEqual([s, "commitment"]);
  });

  it("fires when a brief topic comes up, whole words only", () => {
    expect(detectTrigger("So about the budget for phase two", ctx)).toBe("brief_topic");
    expect(detectTrigger("Their biggest pain points are reporting", ctx)).toBe("brief_topic");
    expect(detectTrigger("The migrations are done", ctx)).toBe("brief_topic");
    expect(detectTrigger("budgetary stuff aside", ctx)).toBeNull();
  });

  it("ignores ordinary talk", () => {
    expect(detectTrigger("Yeah that makes sense, thanks.", ctx)).toBeNull();
    expect(detectTrigger("", ctx)).toBeNull();
  });
});

describe("briefTerms", () => {
  it("takes words from open questions and the watch list", () => {
    const brief = "Goals: relaunch the website.\n\nOpen questions:\n- Hosting provider\n- Who approves design\n\nStakeholders: Dana (marketing)\nIs the analytics vendor staying?";
    const terms = briefTerms(brief, ["questions_to_me", "pain_points", "budget"]);
    expect(terms).toEqual(expect.arrayContaining(["pain points", "budget", "hosting", "provider", "approves", "design", "analytics", "vendor", "staying"]));
    expect(terms).not.toContain("questions to me");
    expect(terms).not.toContain("relaunch");
    expect(terms).not.toContain("marketing");
  });

  it("handles no brief and caps the list", () => {
    expect(briefTerms(null, [])).toEqual([]);
    expect(briefTerms("Open questions:\n" + Array.from({ length: 80 }, (_, i) => `topicword${i}`).join("\n"), [], 10)).toHaveLength(10);
  });
});

describe("shouldCheck", () => {
  const limits = { intervalMs: 30_000, minGapMs: 10_000 };
  it("runs on the interval only after it has passed and when there is something new", () => {
    expect(shouldCheck({ inFlight: false, lastAt: null, newLines: 1 }, 0, "interval", limits)).toBe(true);
    expect(shouldCheck({ inFlight: false, lastAt: 0, newLines: 3 }, 29_000, "interval", limits)).toBe(false);
    expect(shouldCheck({ inFlight: false, lastAt: 0, newLines: 3 }, 30_000, "interval", limits)).toBe(true);
    expect(shouldCheck({ inFlight: false, lastAt: 0, newLines: 0 }, 60_000, "interval", limits)).toBe(false);
  });
  it("lets triggers in sooner but not closer than the minimum gap, and never twice at once", () => {
    expect(shouldCheck({ inFlight: false, lastAt: 0, newLines: 1 }, 9_000, "question", limits)).toBe(false);
    expect(shouldCheck({ inFlight: false, lastAt: 0, newLines: 1 }, 10_000, "commitment", limits)).toBe(true);
    expect(shouldCheck({ inFlight: true, lastAt: 0, newLines: 1 }, 99_000, "question", limits)).toBe(false);
  });
});
