import { requireSession } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { listMeetingTypes } from "@/lib/db/meetingTypes";
import { startMeeting } from "@/lib/db/meetings";
import { handle, json, readJson } from "@/lib/http";
import { LimitError } from "@/lib/policy/limits";
import { assertClientScope, isUuid } from "@/lib/policy/scope";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ clientId: string }> }) {
  return handle("meetings.start", async () => {
    await requireSession();
    const clientId = assertClientScope((await ctx.params).clientId);
    const body = await readJson(request);
    if (!isUuid(body.projectId)) throw new LimitError("projectId");
    const types = await listMeetingTypes(loadConfig().templates);
    const template = typeof body.template === "string" ? body.template : types[0]?.key;
    if (!types.some((t) => t.key === template)) throw new LimitError("template");
    const id = await startMeeting(clientId, body.projectId.toLowerCase(), template);
    return json({ id }, 201);
  });
}
