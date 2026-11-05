import { requireSession } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { listActiveMeetings } from "@/lib/db/recent";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Meetings being recorded right now (names and times only), for a second screen. */
export async function GET() {
  return handle("live.now", async () => {
    await requireSession();
    return json({ meetings: await listActiveMeetings(new Date(), loadConfig().assist.follow_active_hours) });
  });
}
