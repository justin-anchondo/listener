import { requireSession } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { saveSegments } from "@/lib/db/meetings";
import { handle, json, readJson } from "@/lib/http";
import { LimitError, cleanSegments } from "@/lib/policy/limits";
import { assertClientScope, isUuid } from "@/lib/policy/scope";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ clientId: string; meetingId: string }> }) {
  return handle("segments.save", async () => {
    await requireSession();
    const { clientId: rawClient, meetingId } = await ctx.params;
    const clientId = assertClientScope(rawClient);
    if (!isUuid(meetingId)) throw new LimitError("meetingId");
    const { storage, retention } = loadConfig();
    const body = await readJson(request);
    const segments = cleanSegments(body.segments, storage.max_segments_per_post, storage.max_segment_chars);
    const saved = await saveSegments(clientId, meetingId.toLowerCase(), segments, retention.transcript_days);
    return json({ saved });
  });
}
