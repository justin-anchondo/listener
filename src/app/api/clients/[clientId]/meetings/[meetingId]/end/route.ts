import { requireSession } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { endMeeting } from "@/lib/db/meetings";
import { handle, json } from "@/lib/http";
import { LimitError } from "@/lib/policy/limits";
import { assertClientScope, isUuid } from "@/lib/policy/scope";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, ctx: { params: Promise<{ clientId: string; meetingId: string }> }) {
  return handle("meetings.end", async () => {
    await requireSession();
    const { clientId, meetingId } = await ctx.params;
    if (!isUuid(meetingId)) throw new LimitError("meetingId");
    const r = loadConfig().retention;
    await endMeeting(assertClientScope(clientId), meetingId.toLowerCase(), r.transcript_days, new Date(), r.unpinned_suggestion_days);
    return json({ ok: true });
  });
}
