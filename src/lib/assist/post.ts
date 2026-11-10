import { learnedPreferences } from "@/lib/assist/preferences";
import { type Generate, generateWithClaude } from "@/lib/assist/claude";
import { buildPostMeetingPrompt } from "@/lib/assist/prompt";
import { cleanOutput } from "@/lib/assist/schema";
import { talkStats } from "@/lib/assist/stats";
import type { Config } from "@/lib/config";
import { defaultTypeName, getMeetingType } from "@/lib/db/meetingTypes";
import { loadMeetingContext, saveGeneratedSummary } from "@/lib/db/summaries";

export class NothingToSummarizeError extends Error {
  constructor() {
    super("no transcript");
    this.name = "NothingToSummarizeError";
  }
}

/** Calendar date and weekday of an instant in a given IANA time zone. */
export function localDate(at: Date, timeZone: string): { date: string; weekday: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "long" })
    .formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, weekday: get("weekday") };
}

export function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Generates and stores the post meeting summary and action items for one
 * meeting of one client (SPEC 4.3). The prompt holds that client's data only.
 */
export async function summarizeMeeting(
  config: Config,
  clientId: string,
  meetingId: string,
  timeZone: string,
  generate: Generate = generateWithClaude,
): Promise<{ summaryId: string; actionItems: number; briefUpdates: number }> {
  const ctx = await loadMeetingContext(clientId, meetingId, config.assist.brief_amendments_in_prompt);
  if (ctx.segments.length === 0) throw new NothingToSummarizeError();

  const stats = talkStats(ctx.segments, ctx.speakerMap);
  const type = await getMeetingType(ctx.template);
  const { date, weekday } = localDate(ctx.startedAt, timeZone);
  const prompt = buildPostMeetingPrompt({
    preferences: await learnedPreferences(config, clientId, "task"),
    clientName: ctx.clientName,
    projectName: ctx.projectName,
    brief: ctx.brief,
    amendments: ctx.amendments.map((a) => ({ date: localDate(a.date, timeZone).date, text: a.text })),
    template: type?.name ?? defaultTypeName(ctx.template),
    watchFor: type?.watchFor ?? config.templates[ctx.template]?.watch_for ?? [],
    meetingDate: date,
    weekday,
    segments: ctx.segments,
    speakerMap: ctx.speakerMap,
    allowedTags: config.tags,
    stats,
    mergeGapMs: config.assist.transcript_merge_gap_seconds * 1000,
    ownerNames: config.owner.names,
  });

  const { output, model } = await generate(prompt, {
    model: config.models.post,
    effort: config.assist.post_effort,
    maxTokens: config.assist.post_max_tokens,
    timeoutMs: config.assist.post_request_timeout_seconds * 1000,
  });

  const clean = cleanOutput(output, prompt.lineMs, {
    maxListItems: config.assist.max_list_items,
    maxActionItems: config.assist.max_action_items,
    onlyMine: config.assist.only_my_action_items,
    maxItemChars: config.assist.max_item_chars,
    maxFreeTags: config.assist.max_free_form_tags,
    allowedTags: config.tags,
    maxBriefUpdates: config.assist.max_brief_updates,
    knownBriefTexts: ctx.knownAmendmentTexts,
    ownerNames: config.owner.names,
  });

  const summaryId = await saveGeneratedSummary(
    clientId, meetingId, model, { ...clean.content, stats }, clean.tags, clean.actionItems, clean.briefUpdates,
  );
  return { summaryId, actionItems: clean.actionItems.length, briefUpdates: clean.briefUpdates.length };
}
