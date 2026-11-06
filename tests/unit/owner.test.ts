import { describe, expect, it } from "vitest";
import { cleanOutput, type MeetingOutputT, sameTask } from "@/lib/assist/schema";
import { isMine } from "@/lib/owner";

describe("isMine", () => {
  const names = ["Justin"];
  it("matches Me and the owner's names, case insensitive", () => {
    for (const o of ["Me", "me", "Justin", "justin", "Justin A.", "JUSTIN Anchondo"]) expect(isMine(o, names)).toBe(true);
  });
  it("does not match other people or empty owners", () => {
    for (const o of ["Dana", "Justine", "Them", "", null, undefined]) expect(isMine(o, names)).toBe(false);
  });
  it("matches nothing but Me when no names are configured", () => {
    expect(isMine("Justin", [])).toBe(false);
    expect(isMine("Me", [])).toBe(true);
  });
});

describe("cleanOutput owner names", () => {
  it("stores items assigned to the owner's name as Me", () => {
    const out = {
      title: "t", participants: [], purpose: "p", summary: "s", main_points: [], decisions: [], key_quotes: [], tags: [], free_tags: [], brief_updates: [],
      feedback: { went_well: [], suggestions: [], not_covered: [], commitments_by_me: [], open_questions: [] },
      action_items: [
        { title: "Send proposal", owner: "them", owner_name: "Justin", due_date: null, source_quote: "", source_line: 0 },
        { title: "Share brand kit", owner: "them", owner_name: "Dana", due_date: null, source_quote: "", source_line: 0 },
      ],
    } as unknown as MeetingOutputT;
    const r = cleanOutput(out, [0], { maxListItems: 30, maxItemChars: 2000, maxFreeTags: 3, allowedTags: [], ownerNames: ["Justin"] });
    expect(r.actionItems.map((a) => a.owner)).toEqual(["Me", "Dana"]);
  });

  it("merges the same task listed under me and under the owner's name", () => {
    const item = (title: string, owner: string, owner_name: string | null, due_date: string | null) =>
      ({ title, owner, owner_name, due_date, source_quote: "", source_line: 0 });
    const out = {
      title: "t", participants: [], purpose: "p", summary: "s", main_points: [], decisions: [], key_quotes: [], tags: [], free_tags: [], brief_updates: [],
      feedback: { went_well: [], suggestions: [], not_covered: [], commitments_by_me: [], open_questions: [] },
      action_items: [
        item("Send the proposal to Dana", "me", null, null),
        item("Send proposal to Dana", "them", "Justin", "2026-11-06"),
        item("Send the proposal to Dana", "them", "Dana", null),
        item("Share brand kit", "them", "Dana", null),
      ],
    } as unknown as MeetingOutputT;
    const r = cleanOutput(out, [0], { maxListItems: 30, maxItemChars: 2000, maxFreeTags: 3, allowedTags: [], ownerNames: ["Justin"] });
    // The owner's two copies merge; Dana's identically worded copy stays hers.
    expect(r.actionItems.map((a) => [a.title, a.owner, a.dueDate])).toEqual([
      ["Send the proposal to Dana", "Me", "2026-11-06"],
      ["Send the proposal to Dana", "Dana", null],
      ["Share brand kit", "Dana", null],
    ]);
  });

  it("never moves someone else's task onto the owner when merging", () => {
    const item = (title: string, owner: string, owner_name: string | null) => ({ title, owner, owner_name, due_date: null, source_quote: "", source_line: 0 });
    const out = {
      title: "t", participants: [], purpose: "p", summary: "s", main_points: [], decisions: [], key_quotes: [], tags: [], free_tags: [], brief_updates: [],
      feedback: { went_well: [], suggestions: [], not_covered: [], commitments_by_me: [], open_questions: [] },
      action_items: [item("Book the venue", "them", null), item("Book the venue", "me", null), item("Draft the agenda", "unknown", null), item("Draft agenda", "them", "Priya")],
    } as unknown as MeetingOutputT;
    const r = cleanOutput(out, [0], { maxListItems: 30, maxItemChars: 2000, maxFreeTags: 3, allowedTags: [], ownerNames: ["Justin"] });
    expect(r.actionItems.map((a) => [a.title, a.owner])).toEqual([
      ["Book the venue", "Them"],
      ["Book the venue", "Me"],
      ["Draft the agenda", "Priya"],
    ]);
  });

  it("keeps at most the configured number of action items", () => {
    const out = {
      title: "t", participants: [], purpose: "p", summary: "s", main_points: [], decisions: [], key_quotes: [], tags: [], free_tags: [], brief_updates: [],
      feedback: { went_well: [], suggestions: [], not_covered: [], commitments_by_me: [], open_questions: [] },
      action_items: Array.from({ length: 12 }, (_, i) => ({ title: `Distinct task number ${i} about topic ${i * 7}`, owner: "unknown", owner_name: null, due_date: null, source_quote: "", source_line: 0 })),
    } as unknown as MeetingOutputT;
    const r = cleanOutput(out, [0], { maxListItems: 30, maxActionItems: 5, maxItemChars: 2000, maxFreeTags: 3, allowedTags: [] });
    expect(r.actionItems).toHaveLength(5);
  });

  it("tells the model to be selective and never to give the owner someone else's task", async () => {
    const { SYSTEM_PROMPT } = await import("@/lib/assist/prompt");
    expect(SYSTEM_PROMPT).toMatch(/be selective/);
    expect(SYSTEM_PROMPT).toMatch(/Never assign the owner a task someone else committed to/);
    expect(SYSTEM_PROMPT).not.toMatch(/including small ones/);
  });
});

describe("sameTask", () => {
  it("matches rewordings with the same owner and keeps different tasks apart", () => {
    expect(sameTask({ title: "Book the design review", owner: "Me" }, { title: "Book design review", owner: "Me" })).toBe(true);
    expect(sameTask({ title: "Book the design review", owner: "Me" }, { title: "Book design review", owner: null })).toBe(true);
    expect(sameTask({ title: "Book the design review", owner: "Me" }, { title: "Book design review", owner: "Dana" })).toBe(false);
    expect(sameTask({ title: "Book design review", owner: "Me" }, { title: "Book design review", owner: "Them" })).toBe(false);
    expect(sameTask({ title: "Book design review", owner: "Dana" }, { title: "Book design review", owner: "Priya" })).toBe(false);
    expect(sameTask({ title: "Book design review", owner: "Dana" }, { title: "Book design review", owner: "Them" })).toBe(true);
    expect(sameTask({ title: "Send invoice for October", owner: "Me" }, { title: "Send invoice for November", owner: "Me" })).toBe(false);
    expect(sameTask({ title: "Call Dana", owner: "Me" }, { title: "Email Dana", owner: "Me" })).toBe(false);
  });
});

describe("only my action items", () => {
  const out = (items: { title: string; owner: string; owner_name: string | null; due_date: string | null }[]) => ({
    title: "t", participants: [], purpose: "p", summary: "s", main_points: [], decisions: [], key_quotes: [], tags: [], free_tags: [], brief_updates: [],
    feedback: { went_well: [], suggestions: [], not_covered: [], commitments_by_me: [], open_questions: [] },
    action_items: items.map((i) => ({ ...i, source_quote: "", source_line: 0 })),
  }) as unknown as MeetingOutputT;
  const limits = { maxListItems: 30, maxItemChars: 2000, maxFreeTags: 3, allowedTags: [], ownerNames: ["Justin"], onlyMine: true };

  it("keeps the owner's tasks and moves everyone else's to the summary", () => {
    const r = cleanOutput(out([
      { title: "Send the proposal", owner: "me", owner_name: null, due_date: "2026-11-06" },
      { title: "Start the search for Jordan's replacement", owner: "them", owner_name: "Ali Engel", due_date: "2026-11-09" },
      { title: "Share the deck", owner: "them", owner_name: "Justin", due_date: null },
      { title: "Book the venue", owner: "unknown", owner_name: null, due_date: null },
    ]), [0], limits);
    expect(r.actionItems.map((a) => [a.title, a.owner])).toEqual([["Send the proposal", "Me"], ["Share the deck", "Me"]]);
    expect(r.content.others_commitments).toEqual([
      "Ali Engel: Start the search for Jordan's replacement (due 2026-11-09)",
      "Someone: Book the venue",
    ]);
  });

  it("keeps everyone's tasks when the setting is off", () => {
    const r = cleanOutput(out([
      { title: "Send the proposal", owner: "me", owner_name: null, due_date: null },
      { title: "Start the search", owner: "them", owner_name: "Ali Engel", due_date: null },
    ]), [0], { ...limits, onlyMine: false });
    expect(r.actionItems).toHaveLength(2);
    expect(r.content.others_commitments).toEqual([]);
  });

  it("treats unassigned tasks as the owner's own, and reads older summaries without the new list", async () => {
    const { isMyTask } = await import("@/lib/owner");
    expect(isMyTask(null, ["Justin"])).toBe(true);
    expect(isMyTask("Me", ["Justin"])).toBe(true);
    expect(isMyTask("Justin", ["Justin"])).toBe(true);
    expect(isMyTask("Ali Engel", ["Justin"])).toBe(false);
    const { SummaryContent } = await import("@/lib/assist/schema");
    const old = SummaryContent.parse({
      title: "t", purpose: "", summary: "", main_points: [], decisions: [], key_quotes: [],
      feedback: { went_well: [], suggestions: [], not_covered: [], commitments_by_me: [], open_questions: [] }, free_tags: [],
    });
    expect(old.others_commitments).toEqual([]);
  });
});
