import { finishLogin } from "@/lib/auth/passkey";
import { startSession } from "@/lib/auth/session";
import { handle, json, readJson } from "@/lib/http";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle("auth.login.verify", async () => {
    const body = await readJson(request);
    if (!(await finishLogin(body.response as AuthenticationResponseJSON))) {
      return json({ error: "verification_failed" }, 401);
    }
    await startSession();
    return json({ ok: true });
  });
}
