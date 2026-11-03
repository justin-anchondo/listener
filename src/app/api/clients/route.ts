import { requireSession } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { createClient } from "@/lib/db/directory";
import { handle, json, readJson } from "@/lib/http";
import { cleanName } from "@/lib/policy/limits";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle("clients.create", async () => {
    await requireSession();
    const body = await readJson(request);
    const name = cleanName(body.name, loadConfig().storage.max_name_chars);
    return json({ id: await createClient(name) }, 201);
  });
}
