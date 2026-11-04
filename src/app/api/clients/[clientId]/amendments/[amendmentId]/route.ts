import { requireSession } from "@/lib/auth/session";
import { setAmendmentDismissed } from "@/lib/db/amendments";
import { handle, json, readJson } from "@/lib/http";
import { LimitError } from "@/lib/policy/limits";
import { routeIds } from "@/lib/routeIds";

export const dynamic = "force-dynamic";

/** Dismiss or restore an amendment. Its text can't be changed. */
export async function PATCH(request: Request, ctx: { params: Promise<{ clientId: string; amendmentId: string }> }) {
  return handle("amendments.dismiss", async () => {
    await requireSession();
    const { clientId, amendmentId } = routeIds(await ctx.params, "amendmentId");
    const body = await readJson(request);
    if (typeof body.dismissed !== "boolean") throw new LimitError("dismissed");
    await setAmendmentDismissed(clientId, amendmentId, body.dismissed);
    return json({ ok: true });
  });
}
