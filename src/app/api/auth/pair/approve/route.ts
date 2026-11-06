import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { finishLogin } from "@/lib/auth/passkey";
import { requireSession } from "@/lib/auth/session";
import { getPairing, markPairingApproved } from "@/lib/db/pairings";
import { handle, json, readJson } from "@/lib/http";
import { canApprove } from "@/lib/policy/pairing";
import { isUuid } from "@/lib/policy/scope";

export const dynamic = "force-dynamic";

/** The signed in phone approves a computer after a fresh Face ID check. */
export async function POST(request: Request) {
  return handle("auth.pair.approve", async () => {
    await requireSession();
    const body = await readJson(request);
    if (!isUuid(body.id)) return json({ error: "invalid" }, 400);
    if (!(await finishLogin(body.response as AuthenticationResponseJSON, "pair"))) return json({ error: "verification_failed" }, 401);
    const now = new Date();
    const p = await getPairing(String(body.id).toLowerCase());
    if (!p || !canApprove(p, now) || !(await markPairingApproved(p.id, now))) return json({ error: "expired" }, 410);
    return json({ ok: true });
  });
}
