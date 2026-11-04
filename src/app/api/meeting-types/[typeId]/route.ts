import { requireSession } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { NotFoundError } from "@/lib/db/keyring";
import { updateMeetingType } from "@/lib/db/meetingTypes";
import { handle, json, readJson } from "@/lib/http";
import { LimitError, cleanName, cleanWatchFor } from "@/lib/policy/limits";
import { isUuid } from "@/lib/policy/scope";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, ctx: { params: Promise<{ typeId: string }> }) {
  return handle("types.update", async () => {
    await requireSession();
    const { typeId } = await ctx.params;
    if (!isUuid(typeId)) throw new LimitError("typeId");
    const body = await readJson(request);
    const u: { name?: string; watchFor?: string[]; archived?: boolean } = {};
    if ("name" in body) u.name = cleanName(body.name, 60, "name");
    if ("watchFor" in body) u.watchFor = cleanWatchFor(body.watchFor, loadConfig().assist.max_list_items, 80);
    if ("archived" in body) {
      if (typeof body.archived !== "boolean") throw new LimitError("archived");
      u.archived = body.archived;
    }
    if (!(await updateMeetingType(typeId, u))) throw new NotFoundError("meeting type");
    return json({ ok: true });
  });
}
