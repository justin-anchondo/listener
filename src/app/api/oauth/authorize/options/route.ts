import { loginOptions } from "@/lib/auth/passkey";
import { requireSession } from "@/lib/auth/session";
import { connectorOff } from "@/lib/connector/http";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Face ID prompt for approving an AI tool: a fresh check, even when signed in. */
export async function POST() {
  return connectorOff() ?? handle("oauth.authorize_options", async () => {
    await requireSession();
    return json(await loginOptions("connect"));
  });
}
