import { askRecall } from "@/lib/assist/assistant";
import { AssistError } from "@/lib/assist/claude";
import { ASSIST_STATUS } from "@/lib/assist/errors";
import { requireSession } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { handle, json, readJson } from "@/lib/http";
import { logError, logInfo } from "@/lib/log";
import { cleanQuestion } from "@/lib/policy/limits";
import { routeIds } from "@/lib/routeIds";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Answers a question from this client's data only (SPEC 4.2). */
export async function POST(request: Request, ctx: { params: Promise<{ clientId: string }> }) {
  return handle("recall.ask", async () => {
    await requireSession();
    const { clientId } = routeIds(await ctx.params);
    const config = loadConfig();
    const question = cleanQuestion((await readJson(request)).question, config.recall.max_question_chars);
    const started = Date.now();
    try {
      const answer = await askRecall(config, clientId, question);
      logInfo("recall.answered", { clientId, found: answer.found, count: answer.sources.length, ms: Date.now() - started });
      return json(answer);
    } catch (err) {
      if (err instanceof AssistError) {
        logError("recall.failed", { clientId, code: err.code, ms: Date.now() - started });
        return json({ error: err.code }, ASSIST_STATUS[err.code]);
      }
      throw err;
    }
  });
}
