import { isMine } from "@/lib/owner";
import { z } from "zod";

// What the model returns after a meeting (SPEC 4.3). Kept flat and simple so
// it maps cleanly to structured output. Limits are enforced afterwards in
// cleanOutput, from config, not in the schema.

export const ActionItemOut = z.object({
  title: z.string().describe("What needs to happen, as a short imperative sentence"),
  owner: z.enum(["me", "them", "unknown"]).describe("me = only the Listener owner, when they clearly committed or agreed; them = someone else on the call; unknown = not clear who"),
  owner_name: z.string().nullable().describe("Name of the owner if stated, otherwise null"),
  due_date: z.string().nullable().describe("YYYY-MM-DD if a date or day was stated, otherwise null"),
  source_line: z.number().int().describe("Line number in the transcript where this was said"),
  source_quote: z.string().describe("Short verbatim excerpt from that line"),
});

export const KeyQuoteOut = z.object({
  quote: z.string().describe("Verbatim excerpt, at most two sentences"),
  speaker: z.string().describe("Speaker label as shown in the transcript"),
  source_line: z.number().int(),
});

export const FeedbackOut = z.object({
  went_well: z.array(z.string()),
  suggestions: z.array(z.string()).describe("Two or three concrete suggestions for next time"),
  not_covered: z.array(z.string()).describe("Brief or agenda items that did not come up"),
  commitments_by_me: z.array(z.string()),
  open_questions: z.array(z.string()).describe("Questions raised but not answered"),
});

export const MeetingOutput = z.object({
  title: z.string().describe("Short meeting title, under 80 characters"),
  participants: z.array(z.string()).describe("Names of people on the call other than the owner, as far as the transcript shows; empty if unknown"),
  purpose: z.string(),
  summary: z.string().describe("One or two short paragraphs"),
  main_points: z.array(z.string()),
  decisions: z.array(z.string()),
  action_items: z.array(ActionItemOut),
  key_quotes: z.array(KeyQuoteOut).describe("Commitments, numbers, and dates first"),
  feedback: FeedbackOut,
  tags: z.array(z.string()).describe("Only values from the allowed tag list"),
  free_tags: z.array(z.string()).describe("Up to three extra short topic tags"),
  brief_updates: z
    .array(z.string())
    .describe("New lasting facts about the project to add to its brief; empty if nothing new"),
});

export type MeetingOutputT = z.infer<typeof MeetingOutput>;

/** The stored, long lived summary content (action items are stored separately). */
export const SummaryContent = z.object({
  title: z.string(),
  purpose: z.string(),
  summary: z.string(),
  main_points: z.array(z.string()),
  decisions: z.array(z.string()),
  key_quotes: z.array(z.object({ quote: z.string(), speaker: z.string(), at_ms: z.number().int().nonnegative() })),
  feedback: FeedbackOut,
  free_tags: z.array(z.string()),
  participants: z.array(z.string()).default([]),
  /** Other people's commitments, kept as notes rather than tasks ("Ali Engel: Start the search (due 2026-11-09)"). */
  others_commitments: z.array(z.string()).default([]),
});

export type SummaryContentT = z.infer<typeof SummaryContent>;

export type CleanActionItem = {
  title: string;
  owner: string | null;
  dueDate: string | null;
  sourceQuote: string | null;
  sourceMs: number | null;
};

export type CleanLimits = {
  maxListItems: number;
  maxItemChars: number;
  maxFreeTags: number;
  allowedTags: string[];
  maxBriefUpdates?: number;
  /** Amendment texts already on the project (active or dismissed); repeats are dropped. */
  knownBriefTexts?: string[];
  /** Action items kept from one meeting (defaults to maxListItems). */
  maxActionItems?: number;
  /** When true, only the owner's items become tasks; everyone else's go to the summary as notes. */
  onlyMine?: boolean;
  /** The owner's names; items assigned to them are stored as "Me". */
  ownerNames?: string[];
};

export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const STOP = new Set(["the", "a", "an", "to", "for", "of", "and", "on", "with", "by", "about", "me", "my", "our"]);
const taskWords = (t: string) => new Set(normalizeText(t).split(" ").filter((w) => w && !STOP.has(w)));

/**
 * Two action items are the same task when their owners don't conflict and
 * their titles match after normalizing or share nearly all meaningful words.
 * Owners conflict when both name different people, or one is the owner
 * ("Me") and the other someone else ("Them"), so a merge can never move
 * someone else's task onto the owner.
 */
export function sameTask(a: { title: string; owner: string | null }, b: { title: string; owner: string | null }): boolean {
  if (a.owner && b.owner && a.owner !== b.owner) {
    const named = (o: string) => o !== "Them";
    if (named(a.owner) && named(b.owner)) return false;
    if (a.owner === "Me" || b.owner === "Me") return false;
  }
  if (normalizeText(a.title) === normalizeText(b.title)) return true;
  const wa = taskWords(a.title);
  const wb = taskWords(b.title);
  if (wa.size === 0 || wb.size === 0) return false;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / (wa.size + wb.size - shared) >= 0.75;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date in YYYY-MM-DD form. */
export function isIsoDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function list(items: string[], l: CleanLimits): string[] {
  return items.map((s) => clip(s, l.maxItemChars)).filter(Boolean).slice(0, l.maxListItems);
}

/**
 * Normalizes model output: clips lengths, keeps only allowed tags, drops bad
 * dates, and maps transcript line numbers to timestamps (lineMs[i] is the
 * start of line i). Anything the model invents outside these bounds is dropped.
 */
export function cleanOutput(
  out: MeetingOutputT,
  lineMs: number[],
  l: CleanLimits,
): { content: SummaryContentT; tags: string[]; actionItems: CleanActionItem[]; briefUpdates: string[] } {
  const msFor = (line: number) => (Number.isInteger(line) && line >= 0 && line < lineMs.length ? lineMs[line] : null);
  const allowed = new Set(l.allowedTags);
  const tags = [...new Set(out.tags.map((t) => t.trim().toLowerCase()).filter((t) => allowed.has(t)))];
  const freeTags = [...new Set(out.free_tags.map((t) => clip(t.toLowerCase(), 40)).filter((t) => t && !allowed.has(t)))]
    .slice(0, l.maxFreeTags);

  const content: SummaryContentT = {
    title: clip(out.title, 120) || "Untitled meeting",
    purpose: clip(out.purpose, l.maxItemChars),
    summary: clip(out.summary, l.maxItemChars * 3),
    main_points: list(out.main_points, l),
    decisions: list(out.decisions, l),
    key_quotes: out.key_quotes
      .map((q) => ({ quote: clip(q.quote, l.maxItemChars), speaker: clip(q.speaker, 80), at_ms: msFor(q.source_line) }))
      .filter((q): q is { quote: string; speaker: string; at_ms: number } => q.quote !== "" && q.at_ms !== null)
      .slice(0, l.maxListItems),
    feedback: {
      went_well: list(out.feedback.went_well, l),
      suggestions: list(out.feedback.suggestions, l),
      not_covered: list(out.feedback.not_covered, l),
      commitments_by_me: list(out.feedback.commitments_by_me, l),
      open_questions: list(out.feedback.open_questions, l),
    },
    free_tags: freeTags,
    participants: [...new Set((out.participants ?? []).map((p) => clip(p, 60)).filter((p) => p && p.toLowerCase() !== "me"))].slice(0, 12),
    others_commitments: [],
  };

  const allItems = out.action_items
    .map((a) => {
      const name = a.owner_name?.trim() || null;
      const owner = a.owner === "me" || isMine(name, l.ownerNames ?? []) ? "Me" : name ?? (a.owner === "them" ? "Them" : null);
      return {
        title: clip(a.title, l.maxItemChars),
        owner: owner ? clip(owner, 80) : null,
        dueDate: a.due_date && isIsoDate(a.due_date) ? a.due_date : null,
        sourceQuote: a.source_quote.trim() ? clip(a.source_quote, l.maxItemChars) : null,
        sourceMs: msFor(a.source_line),
      };
    })
    .filter((a) => a.title !== "")
    .reduce<CleanActionItem[]>((kept, a) => {
      // The same task often comes back twice (once as "me", once by the owner's
      // name, or reworded). Keep the first, filling in a missing date or owner.
      // Copies from two different people are never merged (sameTask).
      const twin = kept.find((k) => sameTask(k, a));
      if (!twin) kept.push(a);
      else {
        twin.dueDate ??= a.dueDate;
        if (!twin.owner || (twin.owner === "Them" && a.owner !== "Me")) twin.owner = a.owner ?? twin.owner;
      }
      return kept;
    }, [])
    ;

  // Only the owner's commitments become tasks; the rest are kept as notes on the summary.
  const mine = l.onlyMine ? allItems.filter((a) => a.owner === "Me") : allItems;
  const actionItems = mine.slice(0, l.maxActionItems ?? l.maxListItems);
  if (l.onlyMine) {
    content.others_commitments = allItems
      .filter((a) => a.owner !== "Me")
      .map((a) => clip(`${a.owner && a.owner !== "Them" ? a.owner : "Someone"}: ${a.title}${a.dueDate ? ` (due ${a.dueDate})` : ""}`, l.maxItemChars))
      .slice(0, l.maxListItems);
  }

  const known = new Set((l.knownBriefTexts ?? []).map(normalizeText));
  const briefUpdates: string[] = [];
  for (const raw of out.brief_updates ?? []) {
    const text = clip(raw, l.maxItemChars);
    const key = normalizeText(text);
    if (!key || known.has(key)) continue;
    known.add(key);
    briefUpdates.push(text);
  }

  return { content, tags, actionItems, briefUpdates: briefUpdates.slice(0, l.maxBriefUpdates ?? 0) };
}
