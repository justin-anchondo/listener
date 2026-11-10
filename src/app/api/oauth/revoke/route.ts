import { cjson, oauthHandle, preflight, readParams } from "@/lib/connector/http";
import { revokeByToken } from "@/lib/db/connector";
import { hashToken } from "@/lib/policy/connector";

export const dynamic = "force-dynamic";

/** Token revocation (RFC 7009): always 200, whether or not the token existed. */
export async function POST(request: Request) {
  return oauthHandle("oauth.revoke", async () => {
    const p = await readParams(request);
    if (typeof p.token === "string" && p.token.length <= 200) await revokeByToken(hashToken(p.token), new Date());
    return cjson({});
  });
}

export const OPTIONS = preflight;
