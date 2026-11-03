import { requireSession } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { handle, json } from "@/lib/http";
import { logError } from "@/lib/log";
import { TokenError, requestTemporaryToken } from "@/lib/stt/token";

export const dynamic = "force-dynamic";

export async function POST() {
  return handle("stt.token", async () => {
    await requireSession();
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) return json({ error: "not_configured" }, 503);
    try {
      return json(await requestTemporaryToken(apiKey, loadConfig().stt.token_ttl_seconds));
    } catch (err) {
      const status = err instanceof TokenError ? err.status : 0;
      logError("stt.token.failed", { upstreamStatus: status });
      // Deepgram's status code only (e.g. 401, 403), never its response body.
      return json({ error: "upstream", upstreamStatus: status || undefined }, 502);
    }
  });
}
