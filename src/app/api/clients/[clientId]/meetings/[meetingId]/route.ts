import { requireSession } from "@/lib/auth/session";
import { listAmendments } from "@/lib/db/amendments";
import { loadMeetingContext, getMeetingMeta, latestSummary, listMeetingItems } from "@/lib/db/summaries";
import { handle, json } from "@/lib/http";
import { routeIds } from "@/lib/routeIds";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ clientId: string; meetingId: string }> };

/** Everything the meeting screen shows, for one meeting of one client. */
export async function GET(_request: Request, ctx: Ctx) {
  return handle("meetings.get", async () => {
    await requireSession();
    const { clientId, meetingId } = routeIds(await ctx.params, "meetingId");
    const [context, meta, summary, items] = await Promise.all([
      loadMeetingContext(clientId, meetingId),
      getMeetingMeta(clientId, meetingId),
      latestSummary(clientId, meetingId),
      listMeetingItems(clientId, meetingId),
    ]);
    const briefUpdates = (await listAmendments(clientId, context.projectId)).filter((a) => a.meetingId === meetingId);
    const speakers = [...new Set(context.segments.map((s) => s.speaker).filter((s): s is number => s !== null))].sort((a, b) => a - b);
    return json({
      meeting: {
        clientName: context.clientName,
        projectId: context.projectId,
        projectName: context.projectName,
        template: context.template,
        startedAt: meta.startedAt,
        endedAt: meta.endedAt,
        transcriptExpiresAt: meta.transcriptExpiresAt,
      },
      speakerMap: context.speakerMap,
      speakers,
      transcript: context.segments,
      summary,
      items,
      briefUpdates: briefUpdates.map((a) => ({ id: a.id, text: a.text, dismissed: a.dismissed })),
    });
  });
}
