import { describe, expect, it } from "vitest";
import { cleanOutput, type MeetingOutputT } from "@/lib/assist/schema";
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
});
