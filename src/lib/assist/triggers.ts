// Live assistant triggers (SPEC 4.1). Pure functions, run on the phone as
// final transcript lines arrive. A trigger asks for fresh cards right away
// instead of waiting for the next interval.

export type TriggerKind = "question" | "commitment" | "brief_topic";

const STOP = new Set([
  "about", "after", "again", "being", "could", "doing", "every", "first", "going", "great", "have", "into", "just",
  "know", "like", "make", "maybe", "might", "more", "need", "other", "really", "right", "should", "some", "still",
  "that", "their", "there", "these", "thing", "things", "think", "this", "those", "through", "what", "when",
  "where", "which", "while", "will", "with", "would", "your", "yours", "them", "they", "then", "than", "from",
  "were", "been", "does", "done", "want", "also", "much", "many", "very", "here", "over", "under", "between",
  "before", "around", "whether", "question", "questions", "open",
]);

const WEEKDAY = "monday|tuesday|wednesday|thursday|friday|saturday|sunday";
const MONTH = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";

const COMMITMENT = new RegExp(
  [
    "\\b(i'll|i will|we'll|we will|i can get|let me|i'm going to|we're going to|i owe you)\\b",
    "\\b(follow up|get back to you|circle back|send (it|you|over|that|them)|deadline|due (date|on|by))\\b",
    `\\bby (${WEEKDAY}|tomorrow|tonight|today|next week|next month|end of (the )?(day|week|month|quarter)|eod|eow)\\b`,
    `\\b(next|this) (${WEEKDAY}|week|month)\\b`,
    `\\b(${MONTH}) \\d{1,2}(st|nd|rd|th)?\\b`,
    `\\b\\d{1,2}(st|nd|rd|th)? of (${MONTH})\\b`,
    "\\b\\d{4}-\\d{2}-\\d{2}\\b",
  ].join("|"),
  "i",
);

function words(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Topic words to listen for: meaningful words from the brief's open questions
 * (lines with a "?" or under an "open questions" heading, amendments too) and
 * the meeting type's watch list ("pain_points" becomes "pain points").
 */
export function briefTerms(brief: string | null, watchFor: string[], maxTerms = 40): string[] {
  const lines = (brief ?? "").split(/\r?\n/);
  const picked: string[] = [];
  let inOpen = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const heading = /^#+\s/.test(line) || /^[A-Za-z][A-Za-z ]{2,40}:/.test(line);
    if (heading) {
      inOpen = /open questions?/i.test(line);
      const rest = line.replace(/^#+\s*/, "").replace(/^[A-Za-z][A-Za-z ]{2,40}:/, "").trim();
      if (rest && (inOpen || rest.includes("?"))) picked.push(rest);
    } else if (inOpen || line.includes("?")) picked.push(line);
  }
  const terms = new Set<string>();
  for (const w of watchFor) {
    const t = w.replace(/_/g, " ").trim().toLowerCase();
    if (t && t !== "questions to me" && t !== "commitments" && t !== "dates") terms.add(t);
  }
  for (const line of picked) {
    for (const w of words(line)) if (w.length >= 5 && !STOP.has(w) && !/^\d+$/.test(w)) terms.add(w);
  }
  return [...terms].slice(0, maxTerms);
}

/**
 * Checks one finalized line of speech. Returns the first trigger that fits,
 * or null. Speaker identity isn't known live, so "question to the owner" is a
 * question that names the owner or says "you".
 */
export function detectTrigger(text: string, ctx: { ownerNames: string[]; terms: string[] }): TriggerKind | null {
  const t = text.trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  if (t.includes("?")) {
    const asked = t.split(/(?<=[.!?])\s+/).filter((s) => s.includes("?")).join(" ").toLowerCase();
    const names = ctx.ownerNames.map((n) => n.trim().toLowerCase().split(/\s+/)[0]).filter(Boolean);
    if (/\b(you|your|you're|you've|you'd)\b/.test(asked) || names.some((n) => new RegExp(`\\b${escape(n)}\\b`).test(asked))) {
      return "question";
    }
  }
  if (COMMITMENT.test(lower)) return "commitment";
  for (const term of ctx.terms) {
    if (new RegExp(`\\b${escape(term.toLowerCase())}s?\\b`).test(lower)) return "brief_topic";
  }
  return null;
}

/**
 * Decides whether a live check may start now: never while one is running,
 * on the interval, or on a trigger once the minimum gap has passed.
 */
export function shouldCheck(
  state: { inFlight: boolean; lastAt: number | null; newLines: number },
  now: number,
  reason: "interval" | TriggerKind,
  limits: { intervalMs: number; minGapMs: number },
): boolean {
  if (state.inFlight || state.newLines === 0) return false;
  const since = state.lastAt === null ? Infinity : now - state.lastAt;
  return reason === "interval" ? since >= limits.intervalMs : since >= limits.minGapMs;
}
