import { AssistError } from "@/lib/assist/claude";
import { cleanEditedSummary } from "@/lib/assist/edit";
import { NothingToSummarizeError, isTimeZone, summarizeMeeting } from "@/lib/assist/post";
import { requireSession } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { saveEditedSummary } from "@/lib/db/summaries";
import { handle, json, readJson } from "@/lib/http";
import { logError, logInfo } from "@/lib/log";
import { LimitError } from "@/lib/policy/limits";
import { routeIds } from "@/lib/routeIds";

export const dynamic = "force-dynamic";
// Vercel function limit for one generation; config assist.post_request_timeout_seconds stays below it.
export const maxDuration = 300;

type Ctx = { params: Promise<{ clientId: string; meetingId: string }> };

const ASSIST_STATUS: Record<AssistError["code"], number> = {
  not_configured: 503, refused: 422, truncated: 502, invalid: 502, rate_limited: 429, upstream: 502,
};

/** Generates (or regenerates) the summary and action items. */
export async function POST(request: Request, ctx: Ctx) {
  return handle("summary.generate", async () => {
    await requireSession();
    const { clientId, meetingId } = routeIds(await ctx.params, "meetingId");
    const body = await readJson(request).catch(() => ({}) as Record<string, unknown>);
    const timeZone = isTimeZone(body.timeZone) ? body.timeZone : "UTC";
    const started = Date.now();
    try {
      const r = await summarizeMeeting(loadConfig(), clientId, meetingId, timeZone);
      logInfo("summary.generated", { meetingId, count: r.actionItems, ms: Date.now() - started });
      return json(r, 201);
    } catch (err) {
      if (err instanceof NothingToSummarizeError) return json({ error: "empty" }, 409);
      if (err instanceof AssistError) {
        logError("summary.failed", { meetingId, code: err.code, ms: Date.now() - started });
        return json({ error: err.code }, ASSIST_STATUS[err.code]);
      }
      throw err;
    }
  });
}

/** Saves the owner's edits as a new summary version. */
export async function PUT(request: Request, ctx: Ctx) {
  return handle("summary.edit", async () => {
    await requireSession();
    const { clientId, meetingId } = routeIds(await ctx.params, "meetingId");
    const config = loadConfig();
    const body = await readJson(request);
    const { content, tags } = cleanEditedSummary(body, {
      maxListItems: config.assist.max_list_items,
      maxItemChars: config.assist.max_item_chars,
      maxFreeTags: config.assist.max_free_form_tags,
      allowedTags: config.tags,
    });
    if (!content.title) throw new LimitError("title");
    return json({ id: await saveEditedSummary(clientId, meetingId, content, tags) }, 201);
  });
}
