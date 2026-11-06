import { headers } from "next/headers";
import QRCode from "qrcode";
import { relyingParty, setPairCookie } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { countPendingPairings, createPairing } from "@/lib/db/pairings";
import { handle, json } from "@/lib/http";
import { describeDevice, formatCode, newPairing, tooManyPending } from "@/lib/policy/pairing";

export const dynamic = "force-dynamic";

/** A computer asks to sign in. It gets a code to approve on the phone and keeps a secret cookie. */
export async function POST() {
  return handle("auth.pair.start", async () => {
    const { security } = loadConfig();
    const now = new Date();
    if (tooManyPending(await countPendingPairings(now), security.pairing_max_pending)) return json({ error: "busy" }, 429);
    const p = newPairing(now, security.pairing_ttl_seconds);
    const device = describeDevice((await headers()).get("user-agent"));
    await createPairing({ id: p.id, code: p.code, claimHash: p.claimHash, device, expiresAt: p.expiresAt });
    await setPairCookie(`${p.id}.${p.secret}`, security.pairing_ttl_seconds);
    const { origin } = await relyingParty();
    const approveUrl = `${origin}/pair?code=${formatCode(p.code)}`;
    const qr = await QRCode.toString(approveUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    return json({ code: formatCode(p.code), expiresAt: p.expiresAt, approveUrl, qr: `data:image/svg+xml;base64,${Buffer.from(qr).toString("base64")}` });
  });
}
