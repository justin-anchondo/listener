import { requireSession } from "@/lib/auth/session";
import { listDirectory } from "@/lib/db/directory";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle("directory.list", async () => {
    await requireSession();
    return json({ clients: await listDirectory() });
  });
}
