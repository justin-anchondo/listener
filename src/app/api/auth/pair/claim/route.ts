import { clearPairCookie, readPairCookie, startSession } from "@/lib/auth/session";
import { getPairing, markPairingClaimed } from "@/lib/db/pairings";
import { handle, json } from "@/lib/http";
import { canClaim, pairingState, parsePairCookie } from "@/lib/policy/pairing";

export const dynamic = "force-dynamic";

/** The computer checks in; once the phone has approved, this starts its session (once). */
export async function POST() {
  return handle("auth.pair.claim", async () => {
    const cookie = parsePairCookie(await readPairCookie());
    if (!cookie) return json({ state: "expired" });
    const p = await getPairing(cookie.id);
    const now = new Date();
    if (!p) return json({ state: "expired" });
    if (!canClaim(p, cookie.secret, now)) {
      const state = pairingState(p, now);
      return json({ state: state === "approved" || state === "claimed" ? "expired" : state });
    }
    if (!(await markPairingClaimed(p.id, now))) return json({ state: "expired" });
    await clearPairCookie();
    await startSession();
    return json({ state: "signed_in" });
  });
}
