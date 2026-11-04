import { type FastGenerate, fastWithClaude } from "@/lib/assist/claude";
import { LIVE_SYSTEM, LiveOutput, cleanCards, liveContextBlock, liveUserMessage } from "@/lib/assist/live";
import { RECALL_SYSTEM, RecallOutput, type RecallAnswer, cleanRecall, recallMaterial } from "@/lib/assist/recall";
import { speakerLabel } from "@/lib/assist/stats";
import { type TriggerKind, briefTerms } from "@/lib/assist/triggers";
import type { Config } from "@/lib/config";
import { type Suggestion, loadLiveContext, loadRecallContext, saveSuggestions } from "@/lib/db/live";
import { defaultTypeName, getMeetingType } from "@/lib/db/meetingTypes";
import type { LiveLine } from "@/lib/policy/limits";

// Runs live checks and recall for ONE client at a time (CLAUDE.md rule 3).

const CHARS_PER_TOKEN = 4; // rough, for budgeting transcript text into recall

async function typeInfo(config: Config, template: string) {
  const type = await getMeetingType(template);
  return { name: type?.name ?? defaultTypeName(template), watchFor: type?.watchFor ?? config.templates[template]?.watch_for ?? [] };
}

function liveLimits(config: Config) {
  return {
    amendments: config.assist.brief_amendments_in_prompt,
    recentSummaries: config.assist.live_recent_summaries,
    openItems: config.assist.live_open_items,
  };
}

/** Words the phone listens for to trigger an early check (brief open questions and the type's watch list). */
export async function liveTerms(config: Config, clientId: string, meetingId: string): Promise<string[]> {
  const ctx = await loadLiveContext(clientId, meetingId, { ...liveLimits(config), recentSummaries: 0, openItems: 0 });
  const type = await typeInfo(config, ctx.template);
  return briefTerms([ctx.brief ?? "", ...ctx.amendments.map((a) => a.text)].join("\n"), type.watchFor);
}

export async function runLiveCheck(
  config: Config,
  clientId: string,
  meetingId: string,
  window: LiveLine[],
  reason: "interval" | TriggerKind,
  generate: FastGenerate = fastWithClaude,
): Promise<{ cards: Suggestion[]; cacheRead: number }> {
  if (window.length === 0) return { cards: [], cacheRead: 0 };
  const ctx = await loadLiveContext(clientId, meetingId, liveLimits(config));
  const type = await typeInfo(config, ctx.template);
  const lines = window.map((l) => ({ speaker: speakerLabel(l.speaker, {}), startMs: l.startMs, text: l.text }));
  const maxCards = config.assist.live_max_suggestions;
  const { output, cacheRead } = await generate(LiveOutput, {
    system: LIVE_SYSTEM,
    context: liveContextBlock(ctx, type.name, type.watchFor, config.owner.names),
    user: liveUserMessage(lines, ctx.earlier, reason, maxCards),
  }, {
    model: config.models.live,
    maxTokens: config.assist.live_max_tokens,
    timeoutMs: config.assist.live_request_timeout_seconds * 1000,
    effort: config.assist.live_effort,
    thinking: "off",
  });
  const fresh = cleanCards(output, lines, ctx.earlier, { maxCards, maxChars: config.assist.live_card_chars });
  const cards = await saveSuggestions(clientId, meetingId, fresh, config.retention.unpinned_suggestion_days);
  return { cards, cacheRead };
}

export async function askRecall(
  config: Config,
  clientId: string,
  question: string,
  generate: FastGenerate = fastWithClaude,
): Promise<RecallAnswer> {
  const ctx = await loadRecallContext(clientId, {
    recentSummaries: config.recall.recent_summaries,
    amendments: config.assist.brief_amendments_in_prompt,
    items: config.recall.max_items,
    transcriptChars: config.recall.max_context_tokens * CHARS_PER_TOKEN,
  });
  const material = recallMaterial(ctx, config.assist.transcript_merge_gap_seconds * 1000);
  const { output } = await generate(RecallOutput, {
    system: RECALL_SYSTEM,
    context: material.text,
    user: `Today is ${new Date().toISOString().slice(0, 10)}.\n\n<question>\n${question}\n</question>`,
  }, {
    model: config.models.live,
    maxTokens: config.recall.max_tokens,
    timeoutMs: config.recall.request_timeout_seconds * 1000,
    effort: config.recall.effort,
    thinking: "adaptive",
  });
  return cleanRecall(output, material.sources, config.assist.max_item_chars);
}
