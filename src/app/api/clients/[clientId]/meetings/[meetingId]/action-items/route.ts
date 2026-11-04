import { requireSession } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { addActionItem } from "@/lib/db/summaries";
import { handle, json, readJson } from "@/lib/http";
import { cleanDate, cleanName, cleanText } from "@/lib/policy/limits";
import { routeIds } from "@/lib/routeIds";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ clientId: string; meetingId: string }> }) {
  return handle("items.add", async () => {
    await requireSession();
    const { clientId, meetingId } = routeIds(await ctx.params, "meetingId");
    const body = await readJson(request);
    const { assist, storage } = loadConfig();
    const id = await addActionItem(clientId, meetingId, {
      title: cleanName(body.title, assist.max_item_chars, "title"),
      owner: cleanText(body.owner, storage.max_name_chars, "owner"),
      dueDate: cleanDate(body.dueDate, "dueDate"),
      sourceQuote: null,
      sourceMs: null,
    });
    return json({ id }, 201);
  });
}
