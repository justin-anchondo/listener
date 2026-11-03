import { endSession } from "@/lib/auth/session";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST() {
  return handle("auth.logout", async () => {
    await endSession();
    return json({ ok: true });
  });
}
