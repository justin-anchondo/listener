import { requireSession } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { createProject } from "@/lib/db/directory";
import { handle, json, readJson } from "@/lib/http";
import { cleanName } from "@/lib/policy/limits";
import { assertClientScope } from "@/lib/policy/scope";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ clientId: string }> }) {
  return handle("projects.create", async () => {
    await requireSession();
    const clientId = assertClientScope((await ctx.params).clientId);
    const body = await readJson(request);
    const id = await createProject(clientId, cleanName(body.name, loadConfig().storage.max_name_chars));
    return json({ id }, 201);
  });
}
