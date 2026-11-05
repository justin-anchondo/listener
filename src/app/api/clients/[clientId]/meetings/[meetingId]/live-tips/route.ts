import { requireSession } from "@/lib/auth/session";
import { setLiveTips } from "@/lib/db/live";
import { handle, json, readJson } from "@/lib/http";
import { LimitError } from "@/lib/policy/limits";
import { routeIds } from "@/lib/routeIds";

export const dynamic = "force-dynamic";

/** Turns live tips on or off for this meeting, from either screen. */
export async function PATCH(request: Request, ctx: { params: Promise<{ clientId: string; meetingId: string }> }) {
  return handle("live.tips", async () => {
    await requireSession();
    const { clientId, meetingId } = routeIds(await ctx.params, "meetingId");
    const body = await readJson(request);
    if (typeof body.on !== "boolean") throw new LimitError("on");
    await setLiveTips(clientId, meetingId, body.on);
    return json({ ok: true });
  });
}
