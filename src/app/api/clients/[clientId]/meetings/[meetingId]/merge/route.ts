import { requireSession } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { listMergeCandidates, mergeMeetings } from "@/lib/db/merge";
import { handle, json, readJson } from "@/lib/http";
import { LimitError } from "@/lib/policy/limits";
import { MergeError } from "@/lib/policy/merge";
import { isUuid } from "@/lib/policy/scope";
import { routeIds } from "@/lib/routeIds";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ clientId: string; meetingId: string }> };

const HOUR_MS = 3_600_000;

/** Meetings of this client close enough in time to merge with this one. */
export async function GET(_request: Request, ctx: Ctx) {
  return handle("meetings.merge_candidates", async () => {
    await requireSession();
    const { clientId, meetingId } = routeIds(await ctx.params, "meetingId");
    const windowMs = loadConfig().storage.merge_window_hours * HOUR_MS;
    return json({ meetings: await listMergeCandidates(clientId, meetingId, windowMs) });
  });
}

/** Merges another meeting of the same client into this call's earlier recording. */
export async function POST(request: Request, ctx: Ctx) {
  return handle("meetings.merge", async () => {
    await requireSession();
    const { clientId, meetingId } = routeIds(await ctx.params, "meetingId");
    const body = await readJson(request);
    if (typeof body.otherId !== "string" || !isUuid(body.otherId)) throw new LimitError("otherId");
    const config = loadConfig();
    try {
      const r = await mergeMeetings(clientId, meetingId, body.otherId.toLowerCase(), {
        windowMs: config.storage.merge_window_hours * HOUR_MS,
        transcriptDays: config.retention.transcript_days,
        suggestionDays: config.retention.unpinned_suggestion_days,
      });
      return json({ meetingId: r.keep });
    } catch (err) {
      if (err instanceof MergeError) return json({ error: err.reason }, 409);
      throw err;
    }
  });
}
