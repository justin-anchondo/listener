import { requireSession } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { loadFollowState } from "@/lib/db/live";
import { parseAfterSeq } from "@/lib/follow";
import { handle, json } from "@/lib/http";
import { routeIds } from "@/lib/routeIds";

export const dynamic = "force-dynamic";

/** For a second screen: meeting state, transcript lines after ?after=seq, and live cards. */
export async function GET(request: Request, ctx: { params: Promise<{ clientId: string; meetingId: string }> }) {
  return handle("live.follow", async () => {
    await requireSession();
    const { clientId, meetingId } = routeIds(await ctx.params, "meetingId");
    const after = parseAfterSeq(new URL(request.url).searchParams.get("after"));
    return json(await loadFollowState(clientId, meetingId, after, loadConfig().assist.follow_max_segments));
  });
}
