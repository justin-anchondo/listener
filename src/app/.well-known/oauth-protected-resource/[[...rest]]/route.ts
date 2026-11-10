import { connectorOff, cjson, preflight, publicOrigin } from "@/lib/connector/http";

export const dynamic = "force-dynamic";

/** Protected resource metadata (RFC 9728): the MCP endpoint and who issues its tokens. */
export async function GET(request: Request) {
  const off = connectorOff();
  if (off) return off;
  const origin = publicOrigin(request);
  return cjson({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: ["read"],
    bearer_methods_supported: ["header"],
    resource_name: "Listener meetings (read only)",
  });
}

export const OPTIONS = preflight;
