import { requireSession } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { listAmendments } from "@/lib/db/amendments";
import { type ProjectUpdate, getProjectBrief, updateProject } from "@/lib/db/directory";
import { handle, json, readJson } from "@/lib/http";
import { LimitError, cleanName, cleanText } from "@/lib/policy/limits";
import { assertClientScope, isUuid } from "@/lib/policy/scope";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ clientId: string; projectId: string }> };

async function ids(ctx: Ctx) {
  const { clientId, projectId } = await ctx.params;
  if (!isUuid(projectId)) throw new LimitError("projectId");
  return { clientId: assertClientScope(clientId), projectId: projectId.toLowerCase() };
}

export async function GET(_request: Request, ctx: Ctx) {
  return handle("projects.get", async () => {
    await requireSession();
    const { clientId, projectId } = await ids(ctx);
    const [brief, amendments] = await Promise.all([getProjectBrief(clientId, projectId), listAmendments(clientId, projectId)]);
    return json({ brief, amendments });
  });
}

export async function PATCH(request: Request, ctx: Ctx) {
  return handle("projects.update", async () => {
    await requireSession();
    const { clientId, projectId } = await ids(ctx);
    const body = await readJson(request);
    const { storage } = loadConfig();
    const update: ProjectUpdate = {};
    if ("name" in body) update.name = cleanName(body.name, storage.max_name_chars);
    if ("brief" in body) update.brief = cleanText(body.brief, storage.max_brief_chars, "brief");
    if ("status" in body) {
      if (body.status !== "active" && body.status !== "archived") throw new LimitError("status");
      update.status = body.status;
    }
    await updateProject(clientId, projectId, update);
    return json({ ok: true });
  });
}
