import { finishEnrollment } from "@/lib/auth/passkey";
import { startSession } from "@/lib/auth/session";
import { handle, json, readJson } from "@/lib/http";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle("auth.enroll.verify", async () => {
    const body = await readJson(request);
    if (!(await finishEnrollment(body.response as RegistrationResponseJSON))) {
      return json({ error: "verification_failed" }, 400);
    }
    await startSession();
    return json({ ok: true });
  });
}
