import { requireSession } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { setSpeakerMap } from "@/lib/db/summaries";
import { handle, json, readJson } from "@/lib/http";
import { cleanSpeakerMap } from "@/lib/policy/limits";
import { routeIds } from "@/lib/routeIds";

export const dynamic = "force-dynamic";

export async function PUT(request: Request, ctx: { params: Promise<{ clientId: string; meetingId: string }> }) {
  return handle("meetings.speakers", async () => {
    await requireSession();
    const { clientId, meetingId } = routeIds(await ctx.params, "meetingId");
    const body = await readJson(request);
    await setSpeakerMap(clientId, meetingId, cleanSpeakerMap(body.map, loadConfig().storage.max_name_chars));
    return json({ ok: true });
  });
}
