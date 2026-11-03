import { NextResponse } from "next/server";
import { UnauthorizedError } from "@/lib/auth/session";
import { CryptoError } from "@/lib/crypto/keys";
import { NotFoundError } from "@/lib/db/keyring";
import { logError } from "@/lib/log";
import { LimitError } from "@/lib/policy/limits";
import { ScopeError } from "@/lib/policy/scope";

const noStore = { "Cache-Control": "no-store" };

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: noStore });
}

function pgCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown })?.code;
  return typeof code === "string" ? code : undefined;
}

/**
 * Runs a route handler and maps known errors to status codes. Error bodies
 * carry a short code only; nothing from the request or the database.
 */
export async function handle(route: string, fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof UnauthorizedError) return json({ error: "unauthorized" }, 401);
    if (err instanceof ScopeError || err instanceof LimitError) return json({ error: "bad_request" }, 400);
    if (err instanceof NotFoundError) return json({ error: "not_found" }, 404);
    const code = pgCode(err);
    if (code === "23503") return json({ error: "not_found" }, 404); // foreign key: row isn't in this client
    if (code === "23505") return json({ error: "conflict" }, 409);
    const errorCode = err instanceof CryptoError ? "crypto" : (code ?? (err instanceof Error ? err.name : "unknown"));
    logError("route.failed", { code: errorCode, status: 500, route });
    return json({ error: "server_error" }, 500);
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new LimitError("body");
  return body as Record<string, unknown>;
}
