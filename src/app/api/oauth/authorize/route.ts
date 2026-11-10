import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { finishLogin } from "@/lib/auth/passkey";
import { requireSession } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { connectorOff } from "@/lib/connector/http";
import { getOAuthClient, saveCode } from "@/lib/db/connector";
import { handle, json, readJson } from "@/lib/http";
import { OAuthError, cleanAuthorizeRequest, hashToken, newToken, redirectWith } from "@/lib/policy/connector";

export const dynamic = "force-dynamic";

/**
 * The owner's answer on /connect. Approving needs a signed in session and a
 * fresh Face ID check; it returns where to send the browser with a one-time
 * code. Denying returns the access_denied redirect.
 */
export async function POST(request: Request) {
  return connectorOff() ?? handle("oauth.authorize", async () => {
    await requireSession();
    const body = await readJson(request);
    const q = (typeof body.request === "object" && body.request !== null ? body.request : {}) as Record<string, unknown>;
    let req;
    try {
      const client = await getOAuthClient(String(q.client_id ?? ""));
      req = cleanAuthorizeRequest(q, client?.redirectUris ?? null);
    } catch (err) {
      if (err instanceof OAuthError) return json({ error: err.code }, 400);
      throw err;
    }
    if (body.approve !== true) return json({ redirect: redirectWith(req.redirectUri, { error: "access_denied", state: req.state }) });
    if (!(await finishLogin(body.response as AuthenticationResponseJSON, "connect"))) return json({ error: "verification_failed" }, 401);
    const code = newToken();
    const { connector } = loadConfig();
    await saveCode({
      codeHash: hashToken(code), oauthClientId: req.clientId, redirectUri: req.redirectUri, codeChallenge: req.codeChallenge,
      expiresAt: new Date(Date.now() + connector.code_seconds * 1000),
    });
    return json({ redirect: redirectWith(req.redirectUri, { code, state: req.state }) });
  });
}
