import { loadConfig } from "@/lib/config";
import { cjson, oauthHandle, preflight, readParams } from "@/lib/connector/http";
import { countOAuthClients, registerOAuthClient } from "@/lib/db/connector";
import { OAuthError, cleanRegistration, newClientId } from "@/lib/policy/connector";

export const dynamic = "force-dynamic";

/**
 * Dynamic client registration (RFC 7591). Registering grants nothing: every
 * connection still needs the owner's Face ID approval on /connect.
 */
export async function POST(request: Request) {
  return oauthHandle("oauth.register", async () => {
    const { connector } = loadConfig();
    const reg = cleanRegistration(await readParams(request), connector.redirect_hosts);
    if ((await countOAuthClients()) >= connector.max_registered_tools) throw new OAuthError("invalid_client_metadata");
    const id = newClientId();
    await registerOAuthClient({ id, ...reg });
    return cjson({
      client_id: id,
      client_name: reg.name,
      redirect_uris: reg.redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_id_issued_at: Math.floor(Date.now() / 1000),
    }, 201);
  });
}

export const OPTIONS = preflight;
