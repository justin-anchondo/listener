import { requireSession } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { updateSuggestion } from "@/lib/db/live";
import { handle, json, readJson } from "@/lib/http";
import { LimitError } from "@/lib/policy/limits";
import { routeIds } from "@/lib/routeIds";

export const dynamic = "force-dynamic";

/** Pin (keep with the summary) or dismiss a live card. */
export async function PATCH(request: Request, ctx: { params: Promise<{ clientId: string; suggestionId: string }> }) {
  return handle("suggestions.update", async () => {
    await requireSession();
    const { clientId, suggestionId } = routeIds(await ctx.params, "suggestionId");
    const body = await readJson(request);
    const u: { pinned?: boolean; dismissed?: boolean } = {};
    for (const k of ["pinned", "dismissed"] as const) {
      if (k in body) {
        if (typeof body[k] !== "boolean") throw new LimitError(k);
        u[k] = body[k] as boolean;
      }
    }
    await updateSuggestion(clientId, suggestionId, u, loadConfig().retention.unpinned_suggestion_days);
    return json({ ok: true });
  });
}
