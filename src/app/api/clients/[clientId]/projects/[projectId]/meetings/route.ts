import { requireSession } from "@/lib/auth/session";
import { listProjectMeetings } from "@/lib/db/summaries";
import { handle, json } from "@/lib/http";
import { routeIds } from "@/lib/routeIds";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ clientId: string; projectId: string }> }) {
  return handle("meetings.list", async () => {
    await requireSession();
    const { clientId, projectId } = routeIds(await ctx.params, "projectId");
    return json({ meetings: await listProjectMeetings(clientId, projectId) });
  });
}
