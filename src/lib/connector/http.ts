import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { OAuthError } from "@/lib/policy/connector";
import { logError } from "@/lib/log";

// Shared bits for the connector's public endpoints (SPEC 6.6). These are
// called by Claude's servers with bearer tokens, never with cookies, so open
// CORS is safe and lets browser based MCP tools work too.

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
  "Cache-Control": "no-store",
};

export function cjson(body: unknown, status = 200, extra: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { ...CORS, ...extra } });
}

export function preflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export function publicOrigin(request: Request): string {
  return new URL(request.url).origin;
}

/** 404 when the owner turned the connector off in config. */
export function connectorOff(): NextResponse | null {
  return loadConfig().connector.enabled ? null : cjson({ error: "not_found" }, 404);
}

/** OAuth style errors: a code only, never request or database content. */
export async function oauthHandle(route: string, fn: () => Promise<NextResponse>): Promise<NextResponse> {
  const off = connectorOff();
  if (off) return off;
  try {
    return await fn();
  } catch (err) {
    if (err instanceof OAuthError) return cjson({ error: err.code }, err.status);
    const pg = (err as { code?: unknown } | null)?.code;
    const code = typeof pg === "string" ? pg : "unhandled"; // a code only, never a message
    logError("route.failed", { code, status: 500, route });
    return cjson({ error: "server_error" }, 500);
  }
}

/** Reads a form or JSON body as a flat record of strings. */
export async function readParams(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(await request.text()));
  }
  const body = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new OAuthError("invalid_request");
  return body as Record<string, unknown>;
}
