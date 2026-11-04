import { describe, expect, it } from "vitest";
import { cleanCards, liveContextBlock, liveUserMessage } from "@/lib/assist/live";
import { cleanRecall, recallMaterial } from "@/lib/assist/recall";
import type { LiveContext, RecallContext } from "@/lib/db/live";

const ctx: LiveContext = {
  clientName: "Acme",
  projectName: "Website",
  brief: "Open questions:\n- Hosting provider",
  amendments: [{ date: new Date("2026-10-01T00:00:00Z"), text: "Budget capped at $40k." }],
  template: "general",
  openItems: [{ title: "Send proposal", owner: "Me", dueDate: "2026-11-06", status: "open" }],
  recentMeetings: [{ meetingId: "m1", projectName: "Website", date: new Date("2026-10-20T00:00:00Z"), title: "Kickoff", summary: "Agreed scope.", decisions: ["Use Next.js"] }],
  earlier: [{ kind: "reminder", text: "You promised the proposal by Friday." }],
};

const lines = [
  { speaker: "Speaker 1", startMs: 1000, text: "What's the budget again?" },
  { speaker: "Speaker 2", startMs: 4000, text: "We need hosting sorted." },
];

describe("live prompt", () => {
  it("keeps the cached context block stable and free of request specific text", () => {
    const a = liveContextBlock(ctx, "General", ["commitments"], ["Justin"]);
    const b = liveContextBlock({ ...ctx, earlier: [] }, "General", ["commitments"], ["Justin"]);
    expect(a).toBe(b);
    expect(a).toContain("Budget capped at $40k.");
    expect(a).toContain("Send proposal (owner: Me, due 2026-11-06)");
    expect(a).not.toContain("What's the budget");
  });

  it("puts the window, earlier cards, and the reason in the user message", () => {
    const u = liveUserMessage(lines, ctx.earlier, "question", 3);
    expect(u).toContain("[L0] [00:01] Speaker 1: What's the budget again?");
    expect(u).toContain("You promised the proposal by Friday.");
    expect(u).toContain("asked the owner a question");
    expect(u).toContain("at most 3 cards");
  });
});

describe("cleanCards", () => {
  it("clips, drops repeats of earlier cards and of each other, caps the count, and maps lines", () => {
    const out = {
      cards: [
        { kind: "reminder" as const, text: "You promised the proposal by Friday", line: null },
        { kind: "talking_point" as const, text: "  Budget is capped at $40k per the brief.  ", line: 0 },
        { kind: "talking_point" as const, text: "Budget is capped at $40k per the brief", line: 0 },
        { kind: "question" as const, text: "Ask who owns hosting.", line: 7 },
        { kind: "agenda" as const, text: "", line: null },
        { kind: "agenda" as const, text: "Hosting provider is still open.", line: 1 },
      ],
    };
    const r = cleanCards(out, lines, ctx.earlier, { maxCards: 2, maxChars: 30 });
    expect(r).toEqual([
      { kind: "talking_point", text: "Budget is capped at $40k per t", sourceMs: 1000 },
      { kind: "question", text: "Ask who owns hosting.", sourceMs: null },
    ]);
  });
});

describe("recall", () => {
  const rc: RecallContext = {
    clientName: "Acme",
    projects: [{ name: "Website", status: "active", brief: "Relaunch", amendments: [] }],
    meetings: [{
      meetingId: "11111111-1111-4111-8111-111111111111", projectName: "Website", date: new Date("2026-10-20T00:00:00Z"),
      title: "Pricing call", summary: "Agreed $40k.", decisions: [], segments: [{ speaker: 0, startMs: 0, endMs: 1, text: "Forty thousand works." }], speakerMap: { "0": "Dana" },
    }],
    items: [{ title: "Send proposal", owner: "Me", dueDate: null, status: "open", projectName: "Website" }],
  };

  it("labels every source with a ref and includes transcripts with speaker names", () => {
    const m = recallMaterial(rc, 8000);
    expect(m.sources.map((s) => s.ref)).toEqual(["P1", "M1"]);
    expect(m.text).toContain('<meeting ref="M1" date="2026-10-20" project="Website">');
    expect(m.text).toContain("Dana: Forty thousand works.");
    expect(m.text).toContain("[open] Send proposal");
  });

  it("keeps only real refs and treats ungrounded or not found answers as not found", () => {
    const { sources } = recallMaterial(rc, 8000);
    expect(cleanRecall({ found: true, answer: "You agreed $40k.", sources: ["m1", "M9"] }, sources, 500)).toEqual({
      found: true, answer: "You agreed $40k.", sources: [sources[1]],
    });
    expect(cleanRecall({ found: true, answer: "You agreed $40k.", sources: ["M9"] }, sources, 500).found).toBe(false);
    expect(cleanRecall({ found: false, answer: "Probably $40k", sources: ["M1"] }, sources, 500)).toEqual({ found: false, answer: "", sources: [] });
  });
});
