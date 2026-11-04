import { requireSession } from "@/lib/auth/session";
import { listSuggestions } from "@/lib/db/live";
import { handle, json } from "@/lib/http";
import { routeIds } from "@/lib/routeIds";

export const dynamic = "force-dynamic";

/** Cards from this meeting; ?pinned=1 for the ones kept with the summary. */
export async function GET(request: Request, ctx: { params: Promise<{ clientId: string; meetingId: string }> }) {
  return handle("suggestions.list", async () => {
    await requireSession();
    const { clientId, meetingId } = routeIds(await ctx.params, "meetingId");
    const pinned = new URL(request.url).searchParams.get("pinned") === "1";
    return json({ suggestions: await listSuggestions(clientId, meetingId, pinned) });
  });
}
