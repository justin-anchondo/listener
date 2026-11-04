import type { SummaryContentT } from "@/lib/assist/schema";
import { LimitError, cleanList, cleanText } from "@/lib/policy/limits";

export type EditLimits = { maxListItems: number; maxItemChars: number; maxFreeTags: number; allowedTags: string[] };

/** Validates an owner edited summary from the meeting screen. */
export function cleanEditedSummary(body: Record<string, unknown>, l: EditLimits): { content: SummaryContentT; tags: string[] } {
  const c = body.content as Record<string, unknown> | undefined;
  if (typeof c !== "object" || c === null) throw new LimitError("content");
  const list = (v: unknown, f: string) => cleanList(v ?? [], l.maxListItems, l.maxItemChars, f);
  const fb = (c.feedback ?? {}) as Record<string, unknown>;
  const quotes = Array.isArray(c.key_quotes) ? c.key_quotes : [];
  if (quotes.length > l.maxListItems) throw new LimitError("key_quotes");
  const title = cleanText(c.title, 120, "title");
  if (!title) throw new LimitError("title");
  const tags = cleanList(body.tags ?? [], l.maxListItems, 40, "tags").filter((t) => l.allowedTags.includes(t));
  return {
    tags: [...new Set(tags)],
    content: {
      title,
      purpose: cleanText(c.purpose, l.maxItemChars, "purpose") ?? "",
      summary: cleanText(c.summary, l.maxItemChars * 3, "summary") ?? "",
      main_points: list(c.main_points, "main_points"),
      decisions: list(c.decisions, "decisions"),
      key_quotes: quotes.map((q) => {
        const r = q as Record<string, unknown>;
        if (typeof r.quote !== "string" || typeof r.speaker !== "string" || !Number.isInteger(r.at_ms) || (r.at_ms as number) < 0) {
          throw new LimitError("key_quotes");
        }
        if (r.quote.length > l.maxItemChars || r.speaker.length > 80) throw new LimitError("key_quotes");
        return { quote: r.quote.trim(), speaker: r.speaker.trim(), at_ms: r.at_ms as number };
      }).filter((q) => q.quote),
      feedback: {
        went_well: list(fb.went_well, "feedback"),
        suggestions: list(fb.suggestions, "feedback"),
        not_covered: list(fb.not_covered, "feedback"),
        commitments_by_me: list(fb.commitments_by_me, "feedback"),
        open_questions: list(fb.open_questions, "feedback"),
      },
      free_tags: cleanList(c.free_tags ?? [], l.maxFreeTags, 40, "free_tags"),
    },
  };
}
