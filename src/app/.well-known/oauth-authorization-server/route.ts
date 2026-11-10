import { connectorOff, cjson, preflight, publicOrigin } from "@/lib/connector/http";

export const dynamic = "force-dynamic";

/** OAuth server metadata (RFC 8414) for the Claude connector (SPEC 6.6). */
export async function GET(request: Request) {
  const off = connectorOff();
  if (off) return off;
  const origin = publicOrigin(request);
  return cjson({
    issuer: origin,
    authorization_endpoint: `${origin}/connect`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    revocation_endpoint: `${origin}/api/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["read"],
  });
}

export const OPTIONS = preflight;
