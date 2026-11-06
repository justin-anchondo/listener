import { loginOptions } from "@/lib/auth/passkey";
import { requireSession } from "@/lib/auth/session";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Face ID prompt for approving a computer: a fresh check, even on a signed in phone. */
export async function POST() {
  return handle("auth.pair.approve_options", async () => {
    await requireSession();
    return json(await loginOptions("pair"));
  });
}
