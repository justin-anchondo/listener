import { liveTerms, runLiveCheck } from "@/lib/assist/assistant";
import { AssistError } from "@/lib/assist/claude";
import { ASSIST_STATUS } from "@/lib/assist/errors";
import { requireSession } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { handle, json, readJson } from "@/lib/http";
import { logError, logInfo } from "@/lib/log";
import { LimitError, cleanLiveWindow } from "@/lib/policy/limits";
import { routeIds } from "@/lib/routeIds";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Ctx = { params: Promise<{ clientId: string; meetingId: string }> };

const REASONS = new Set(["interval", "question", "commitment", "brief_topic"]);

/** Topic words the phone listens for, from the brief's open questions and the meeting type. */
export async function GET(_request: Request, ctx: Ctx) {
  return handle("live.terms", async () => {
    await requireSession();
    const { clientId, meetingId } = routeIds(await ctx.params, "meetingId");
    return json({ terms: await liveTerms(loadConfig(), clientId, meetingId) });
  });
}

/** One live check: the phone sends the recent transcript window, gets back new cards. */
export async function POST(request: Request, ctx: Ctx) {
  return handle("live.check", async () => {
    await requireSession();
    const { clientId, meetingId } = routeIds(await ctx.params, "meetingId");
    const config = loadConfig();
    const body = await readJson(request);
    if (typeof body.reason !== "string" || !REASONS.has(body.reason)) throw new LimitError("reason");
    const reason = body.reason as "interval" | "question" | "commitment" | "brief_topic";
    const window = cleanLiveWindow(body.lines, config.storage.max_segments_per_post, config.storage.max_segment_chars, config.assist.live_max_window_chars);
    const started = Date.now();
    try {
      const { cards, cacheRead } = await runLiveCheck(config, clientId, meetingId, window, reason);
      logInfo("live.checked", { meetingId, reason, count: cards.length, cacheRead, ms: Date.now() - started });
      return json({ cards });
    } catch (err) {
      if (err instanceof AssistError) {
        logError("live.failed", { meetingId, code: err.code, ms: Date.now() - started });
        return json({ error: err.code }, ASSIST_STATUS[err.code]);
      }
      throw err;
    }
  });
}
