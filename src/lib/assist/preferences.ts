import type { Config } from "@/lib/config";
import { loadClientFeedback, loadReasonCounts } from "@/lib/db/feedback";
import type { FeedbackKind } from "@/lib/policy/feedback";

// Turns the owner's feedback into a short instruction block for prompts.
// Client examples come from one client only; the habits line uses reason
// counts across clients, which carry no client text.

export type ClientFeedback = {
  removed: { text: string; reason: string | null }[];
  kept: string[];
};
export type ReasonCount = { signal: string; reason: string | null; n: number };

const REASON_TEXT: Record<string, string> = {
  not_mine: "not the owner's task",
  not_a_task: "not a real task",
  too_vague: "too vague",
  duplicate: "a duplicate",
  not_useful: "not useful",
  already_known: "something the owner already knew",
  wrong: "wrong",
  other: "other",
};

const quote = (t: string) => `"${t.replace(/\s+/g, " ").trim()}"`;

export function preferencesBlock(kind: FeedbackKind, client: ClientFeedback, counts: ReasonCount[], minCount: number): string {
  const noun = kind === "task" ? "action items" : "live tips";
  const lines: string[] = [];
  if (client.removed.length) {
    lines.push(`${kind === "task" ? "Action items" : "Tips"} the owner removed for this client (avoid similar ones):`);
    for (const r of client.removed) lines.push(`- ${quote(r.text)}${r.reason ? ` (${REASON_TEXT[r.reason] ?? r.reason})` : ""}`);
  }
  if (client.kept.length) {
    lines.push(`${kind === "task" ? "Action items" : "Tips"} the owner ${kind === "task" ? "completed or edited" : "pinned"} for this client (this is the kind that helps):`);
    for (const t of client.kept) lines.push(`- ${quote(t)}`);
  }
  const habits = counts
    .filter((c) => c.signal === "removed" && c.reason && c.reason !== "other" && c.n >= minCount)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .map((c) => `${REASON_TEXT[c.reason!] ?? c.reason} (${c.n} times)`);
  if (habits.length) lines.push(`Across all clients, the owner most often removes ${noun} as: ${habits.join("; ")}. Hold back anything that would fit those.`);
  return lines.join("\n");
}

/**
 * The preferences block for one client's prompt: that client's own examples
 * plus cross-client reason counts. Learning never blocks the real work.
 */
export async function learnedPreferences(config: Config, clientId: string, kind: FeedbackKind): Promise<string> {
  try {
    const [client, counts] = await Promise.all([
      loadClientFeedback(clientId, kind, config.learning.examples_in_prompt),
      loadReasonCounts(kind),
    ]);
    return preferencesBlock(kind, client, counts, config.learning.min_count_for_habit);
  } catch {
    return "";
  }
}
