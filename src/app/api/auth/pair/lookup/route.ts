import { requireSession } from "@/lib/auth/session";
import { findPairingByCode } from "@/lib/db/pairings";
import { handle, json, readJson } from "@/lib/http";
import { canApprove, formatCode, normalizeCode } from "@/lib/policy/pairing";

export const dynamic = "force-dynamic";

/** The signed in phone looks up a computer's code before approving it. */
export async function POST(request: Request) {
  return handle("auth.pair.lookup", async () => {
    await requireSession();
    const code = normalizeCode((await readJson(request)).code);
    if (!code) return json({ error: "invalid_code" }, 400);
    const p = await findPairingByCode(code, new Date());
    if (!p || !canApprove(p, new Date())) return json({ error: "not_found" }, 404);
    return json({ id: p.id, code: formatCode(p.code), device: p.device, expiresAt: p.expiresAt });
  });
}
