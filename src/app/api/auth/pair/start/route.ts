import { headers } from "next/headers";
import QRCode from "qrcode";
import { readPairCookie, relyingParty, setPairCookie } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { countPendingPairings, createPairing, getPairing } from "@/lib/db/pairings";
import { handle, json } from "@/lib/http";
import { canApprove, describeDevice, formatCode, newPairing, parsePairCookie, tooManyPending } from "@/lib/policy/pairing";

const UNDEFINED_TABLE = "42P01"; // migration 0007 not applied yet

async function qrFor(code: string) {
  const { origin } = await relyingParty();
  const approveUrl = `${origin}/pair?code=${formatCode(code)}`;
  const qr = await QRCode.toString(approveUrl, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return { approveUrl, qr: `data:image/svg+xml;base64,${Buffer.from(qr).toString("base64")}` };
}

export const dynamic = "force-dynamic";

/** A computer asks to sign in. It gets a code to approve on the phone and keeps a secret cookie. */
export async function POST() {
  return handle("auth.pair.start", async () => {
    const { security } = loadConfig();
    const now = new Date();
    try {
      // A reload keeps this browser's code while it's still waiting, instead of making another.
      const mine = parsePairCookie(await readPairCookie());
      const existing = mine ? await getPairing(mine.id) : null;
      if (existing && canApprove(existing, now)) {
        return json({ code: formatCode(existing.code), expiresAt: existing.expiresAt, ...(await qrFor(existing.code)) });
      }
      if (tooManyPending(await countPendingPairings(now), security.pairing_max_pending)) return json({ error: "busy" }, 429);
      const p = newPairing(now, security.pairing_ttl_seconds);
      const device = describeDevice((await headers()).get("user-agent"));
      await createPairing({ id: p.id, code: p.code, claimHash: p.claimHash, device, expiresAt: p.expiresAt });
      await setPairCookie(`${p.id}.${p.secret}`, security.pairing_ttl_seconds);
      return json({ code: formatCode(p.code), expiresAt: p.expiresAt, ...(await qrFor(p.code)) });
    } catch (err) {
      if ((err as { code?: string }).code === UNDEFINED_TABLE) return json({ error: "not_ready" }, 503);
      throw err;
    }
  });
}
