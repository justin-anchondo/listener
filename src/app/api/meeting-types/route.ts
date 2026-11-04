import { requireSession } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { createMeetingType, listMeetingTypes } from "@/lib/db/meetingTypes";
import { handle, json, readJson } from "@/lib/http";
import { cleanName, cleanWatchFor } from "@/lib/policy/limits";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle("types.list", async () => {
    await requireSession();
    const all = new URL(request.url).searchParams.get("all") === "1";
    return json({ types: await listMeetingTypes(loadConfig().templates, all) });
  });
}

export async function POST(request: Request) {
  return handle("types.create", async () => {
    await requireSession();
    const body = await readJson(request);
    const { assist } = loadConfig();
    const type = await createMeetingType(cleanName(body.name, 60, "name"), cleanWatchFor(body.watchFor, assist.max_list_items, 80));
    return json({ type }, 201);
  });
}
