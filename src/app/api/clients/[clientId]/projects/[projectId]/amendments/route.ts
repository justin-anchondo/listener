import { requireSession } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { addOwnerNote } from "@/lib/db/amendments";
import { handle, json, readJson } from "@/lib/http";
import { LimitError, cleanText } from "@/lib/policy/limits";
import { routeIds } from "@/lib/routeIds";

export const dynamic = "force-dynamic";

/** Owner adds a note to the project brief's amendments. */
export async function POST(request: Request, ctx: { params: Promise<{ clientId: string; projectId: string }> }) {
  return handle("amendments.add", async () => {
    await requireSession();
    const { clientId, projectId } = routeIds(await ctx.params, "projectId");
    const body = await readJson(request);
    const text = cleanText(body.text, loadConfig().assist.max_item_chars, "text");
    if (!text) throw new LimitError("text");
    return json({ id: await addOwnerNote(clientId, projectId, text.trim()) }, 201);
  });
}
