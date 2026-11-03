import { requireSession } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { deleteClient, renameClient } from "@/lib/db/directory";
import { handle, json, readJson } from "@/lib/http";
import { cleanName } from "@/lib/policy/limits";
import { assertClientScope } from "@/lib/policy/scope";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ clientId: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  return handle("clients.rename", async () => {
    await requireSession();
    const clientId = assertClientScope((await ctx.params).clientId);
    const body = await readJson(request);
    await renameClient(clientId, cleanName(body.name, loadConfig().storage.max_name_chars));
    return json({ ok: true });
  });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  return handle("clients.delete", async () => {
    await requireSession();
    await deleteClient(assertClientScope((await ctx.params).clientId));
    return json({ ok: true });
  });
}
