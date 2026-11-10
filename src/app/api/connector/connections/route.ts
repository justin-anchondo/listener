import { requireSession } from "@/lib/auth/session";
import { listConnections } from "@/lib/db/connector";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** The owner's connected AI tools (no client data). */
export async function GET() {
  return handle("connector.list", async () => {
    await requireSession();
    return json({ connections: await listConnections(new Date()) });
  });
}
