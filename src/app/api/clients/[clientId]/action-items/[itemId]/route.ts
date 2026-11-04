import { requireSession } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { type ItemUpdate, deleteActionItem, updateActionItem } from "@/lib/db/summaries";
import { handle, json, readJson } from "@/lib/http";
import { LimitError, cleanDate, cleanName, cleanText } from "@/lib/policy/limits";
import { routeIds } from "@/lib/routeIds";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ clientId: string; itemId: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  return handle("items.update", async () => {
    await requireSession();
    const { clientId, itemId } = routeIds(await ctx.params, "itemId");
    const body = await readJson(request);
    const { assist, storage } = loadConfig();
    const u: ItemUpdate = {};
    if ("title" in body) u.title = cleanName(body.title, assist.max_item_chars, "title");
    if ("owner" in body) u.owner = cleanText(body.owner, storage.max_name_chars, "owner");
    if ("dueDate" in body) u.dueDate = cleanDate(body.dueDate, "dueDate");
    if ("snoozedUntil" in body) u.snoozedUntil = cleanDate(body.snoozedUntil, "snoozedUntil");
    if ("status" in body) {
      if (body.status !== "open" && body.status !== "done") throw new LimitError("status");
      u.status = body.status;
    }
    await updateActionItem(clientId, itemId, u);
    return json({ ok: true });
  });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  return handle("items.delete", async () => {
    await requireSession();
    const { clientId, itemId } = routeIds(await ctx.params, "itemId");
    await deleteActionItem(clientId, itemId);
    return json({ ok: true });
  });
}
