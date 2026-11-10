import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { CORS, cjson, connectorOff, preflight, publicOrigin } from "@/lib/connector/http";
import { handleRpc } from "@/lib/connector/mcp";
import { grantForAccess } from "@/lib/db/connector";
import { logError } from "@/lib/log";
import { bearerToken, grantState, hashToken } from "@/lib/policy/connector";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function unauthorized(request: Request, error = "invalid_token"): NextResponse {
  const meta = `${publicOrigin(request)}/.well-known/oauth-protected-resource`;
  return cjson({ error }, 401, { "WWW-Authenticate": `Bearer error="${error}", resource_metadata="${meta}"` });
}

/** The read-only MCP endpoint Claude calls (SPEC 6.6). Bearer token required on every request. */
export async function POST(request: Request) {
  const off = connectorOff();
  if (off) return off;
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return unauthorized(request, "invalid_request");
  try {
    const grant = await grantForAccess(hashToken(token), new Date());
    if (grantState(grant, new Date()) !== "active") return unauthorized(request);
    const body = await request.json().catch(() => undefined);
    if (body === undefined) return cjson({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
    const ctx = { config: loadConfig(), grantId: grant!.id };
    if (Array.isArray(body)) {
      const replies = (await Promise.all(body.map((m) => handleRpc(m, ctx)))).filter(Boolean);
      return replies.length ? cjson(replies) : new NextResponse(null, { status: 202, headers: CORS });
    }
    const out = await handleRpc(body, ctx);
    return out ? cjson(out) : new NextResponse(null, { status: 202, headers: CORS });
  } catch (err) {
    const pg = (err as { code?: unknown } | null)?.code;
    const code = typeof pg === "string" ? pg : "unhandled"; // a code only, never a message
    logError("route.failed", { code, status: 500, route: "mcp" });
    return cjson({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error" } }, 500);
  }
}

/** No server-initiated stream: this server only answers requests. */
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
}

export async function DELETE() {
  return new NextResponse(null, { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
}

export const OPTIONS = preflight;
