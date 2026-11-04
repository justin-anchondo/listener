import { requireSession } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { listRecentMeetings } from "@/lib/db/recent";
import { handle, json } from "@/lib/http";
import { LimitError } from "@/lib/policy/limits";
import { assertClientScope, isUuid } from "@/lib/policy/scope";

export const dynamic = "force-dynamic";

// Cross client by design (SPEC 6.3): titles, participants, names, dates. Never sent to a model.
export async function GET(request: Request) {
  return handle("meetings.recent", async () => {
    await requireSession();
    const params = new URL(request.url).searchParams;
    const client = params.get("client");
    const project = params.get("project");
    if (project && (!client || !isUuid(project))) throw new LimitError("project");
    const meetings = await listRecentMeetings(
      loadConfig().storage.recent_meetings,
      client ? assertClientScope(client) : undefined,
      project ? project.toLowerCase() : undefined,
    );
    return json({ meetings });
  });
}
