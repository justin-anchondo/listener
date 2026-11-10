import { requireSession } from "@/lib/auth/session";
import { revokeConnection } from "@/lib/db/connector";
import { handle, json } from "@/lib/http";
import { isUuid } from "@/lib/policy/scope";

export const dynamic = "force-dynamic";

/** Disconnects a tool now: its tokens stop working on the next call. */
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle("connector.revoke", async () => {
    await requireSession();
    const { id } = await ctx.params;
    if (!isUuid(id)) return json({ error: "bad_request" }, 400);
    if (!(await revokeConnection(id.toLowerCase(), new Date()))) return json({ error: "not_found" }, 404);
    return json({ ok: true });
  });
}
