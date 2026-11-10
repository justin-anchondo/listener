import { loadConfig } from "@/lib/config";
import { cjson, oauthHandle, preflight, readParams } from "@/lib/connector/http";
import { redeemCode, rotateGrant } from "@/lib/db/connector";
import { OAuthError, canRedeemCode, canRefresh, hashToken, newToken, tokenLifetimes } from "@/lib/policy/connector";

export const dynamic = "force-dynamic";

/** Exchanges a one-time code (with its PKCE verifier) or a refresh token for new tokens. */
export async function POST(request: Request) {
  return oauthHandle("oauth.token", async () => {
    const p = await readParams(request);
    const now = new Date();
    const life = tokenLifetimes(now, loadConfig().connector);
    const access = newToken();
    const refresh = newToken();
    const tokens = { access_token: access, token_type: "Bearer", expires_in: life.expiresIn, refresh_token: refresh, scope: "read" };

    if (p.grant_type === "authorization_code") {
      if (typeof p.code !== "string") throw new OAuthError("invalid_request");
      const ok = await redeemCode(
        hashToken(p.code),
        (row) => canRedeemCode(row, { clientId: p.client_id, redirectUri: p.redirect_uri, verifier: p.code_verifier }, now),
        { accessHash: hashToken(access), refreshHash: hashToken(refresh), accessExpiresAt: life.accessExpiresAt, refreshExpiresAt: life.refreshExpiresAt },
        now,
      );
      if (!ok) throw new OAuthError("invalid_grant");
      return cjson(tokens);
    }
    if (p.grant_type === "refresh_token") {
      if (typeof p.refresh_token !== "string") throw new OAuthError("invalid_request");
      const ok = await rotateGrant(hashToken(p.refresh_token), (g) => canRefresh(g, now), {
        accessHash: hashToken(access), refreshHash: hashToken(refresh), accessExpiresAt: life.accessExpiresAt,
      });
      if (!ok) throw new OAuthError("invalid_grant");
      return cjson(tokens);
    }
    throw new OAuthError("unsupported_grant_type");
  });
}

export const OPTIONS = preflight;
