import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { isUuid } from "@/lib/policy/scope";

// SPEC 6.6: a read-only connector for Claude. OAuth 2.1 authorization code
// with PKCE (S256 only), public clients registered dynamically, short access
// tokens, rotating refresh tokens, and revocation. Only hashes are stored.
// Every rule the routes rely on lives here as a pure function.

export class OAuthError extends Error {
  constructor(public readonly code: "invalid_request" | "invalid_client" | "invalid_grant" | "unsupported_grant_type" | "invalid_redirect_uri" | "invalid_client_metadata", public readonly status = 400) {
    super(code);
    this.name = "OAuthError";
  }
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function newClientId(): string {
  return randomBytes(18).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** RFC 7636 S256: base64url(sha256(verifier)) must equal the challenge. */
export function verifyPkce(verifier: unknown, challenge: string): boolean {
  if (typeof verifier !== "string" || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const expected = Buffer.from(createHash("sha256").update(verifier).digest("base64url"));
  const given = Buffer.from(challenge);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function isPkceChallenge(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

/** A redirect must be https on an allowed host, or http on this machine (for local tools). */
export function cleanRedirectUri(value: unknown, hosts: string[]): string {
  if (typeof value !== "string" || value.length > 500) throw new OAuthError("invalid_redirect_uri");
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new OAuthError("invalid_redirect_uri");
  }
  if (u.hash || u.username || u.password) throw new OAuthError("invalid_redirect_uri");
  const local = u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  const allowed = u.protocol === "https:" && hosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  if (!local && !allowed) throw new OAuthError("invalid_redirect_uri");
  return u.toString();
}

/** Dynamic client registration (RFC 7591), public clients only. */
export function cleanRegistration(body: Record<string, unknown>, hosts: string[]): { name: string; redirectUris: string[] } {
  const uris = body.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 5) throw new OAuthError("invalid_redirect_uri");
  const method = body.token_endpoint_auth_method ?? "none";
  if (method !== "none") throw new OAuthError("invalid_client_metadata");
  const grants = body.grant_types;
  if (grants !== undefined && (!Array.isArray(grants) || grants.some((g) => g !== "authorization_code" && g !== "refresh_token"))) {
    throw new OAuthError("invalid_client_metadata");
  }
  const raw = typeof body.client_name === "string" ? body.client_name : "AI tool";
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 100) || "AI tool";
  return { name, redirectUris: uris.map((u) => cleanRedirectUri(u, hosts)) };
}

export type AuthorizeRequest = { clientId: string; redirectUri: string; codeChallenge: string; state: string | null };

/** The query Claude opens /connect with. The redirect must be one the client registered. */
export function cleanAuthorizeRequest(q: Record<string, unknown>, registered: string[] | null): AuthorizeRequest {
  if (!registered) throw new OAuthError("invalid_client");
  const redirectUri = typeof q.redirect_uri === "string" ? q.redirect_uri : "";
  if (!registered.includes(redirectUri)) throw new OAuthError("invalid_redirect_uri");
  if (q.response_type !== "code") throw new OAuthError("invalid_request");
  if (q.code_challenge_method !== "S256" || !isPkceChallenge(q.code_challenge)) throw new OAuthError("invalid_request");
  const state = typeof q.state === "string" && q.state.length <= 500 ? q.state : null;
  return { clientId: String(q.client_id), redirectUri, codeChallenge: q.code_challenge, state };
}

/** Where the browser goes after approval or denial. */
export function redirectWith(redirectUri: string, params: Record<string, string | null>): string {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v !== null) u.searchParams.set(k, v);
  return u.toString();
}

export type CodeRow = { oauthClientId: string; redirectUri: string; codeChallenge: string; expiresAt: Date; usedAt: Date | null };

/** A code works once, before it expires, for the same client and redirect, with the right verifier. */
export function canRedeemCode(code: CodeRow | null, req: { clientId: unknown; redirectUri: unknown; verifier: unknown }, now: Date): boolean {
  if (!code || code.usedAt || code.expiresAt <= now) return false;
  if (req.clientId !== code.oauthClientId || req.redirectUri !== code.redirectUri) return false;
  return verifyPkce(req.verifier, code.codeChallenge);
}

export type GrantRow = { id: string; accessExpiresAt: Date; refreshExpiresAt: Date; revokedAt: Date | null };

export function grantState(g: GrantRow | null, now: Date): "active" | "expired" | "revoked" | "missing" {
  if (!g) return "missing";
  if (g.revokedAt) return "revoked";
  return g.accessExpiresAt > now ? "active" : "expired";
}

export function canRefresh(g: GrantRow | null, now: Date): boolean {
  return !!g && !g.revokedAt && g.refreshExpiresAt > now;
}

export function tokenLifetimes(now: Date, c: { access_token_minutes: number; refresh_token_days: number }) {
  return {
    accessExpiresAt: new Date(now.getTime() + c.access_token_minutes * 60_000),
    refreshExpiresAt: new Date(now.getTime() + c.refresh_token_days * 86_400_000),
    expiresIn: c.access_token_minutes * 60,
  };
}

/** The token from an Authorization: Bearer header. */
export function bearerToken(header: string | null): string | null {
  const m = header?.match(/^Bearer ([A-Za-z0-9_-]{20,200})$/);
  return m ? m[1] : null;
}

// Tools are read only. Each one that touches client data names exactly one client.
export type ToolName = "list_clients" | "list_meetings" | "get_summary" | "get_transcript" | "get_speaking_stats";
export const TOOL_NAMES: readonly ToolName[] = ["list_clients", "list_meetings", "get_summary", "get_transcript", "get_speaking_stats"];

export type ToolArgs =
  | { tool: "list_clients" }
  | { tool: "list_meetings"; clientId: string; projectId: string | null; limit: number }
  | { tool: "get_summary" | "get_transcript" | "get_speaking_stats"; clientId: string; meetingId: string };

export function cleanToolCall(name: unknown, args: unknown, maxMeetings: number): ToolArgs {
  if (typeof name !== "string" || !TOOL_NAMES.includes(name as ToolName)) throw new OAuthError("invalid_request");
  const a = (typeof args === "object" && args !== null ? args : {}) as Record<string, unknown>;
  const uuid = (v: unknown) => {
    if (!isUuid(v)) throw new OAuthError("invalid_request");
    return (v as string).toLowerCase();
  };
  switch (name as ToolName) {
    case "list_clients":
      return { tool: "list_clients" };
    case "list_meetings": {
      const limit = a.limit === undefined ? maxMeetings : Number(a.limit);
      if (!Number.isInteger(limit) || limit < 1) throw new OAuthError("invalid_request");
      return { tool: "list_meetings", clientId: uuid(a.client_id), projectId: a.project_id === undefined || a.project_id === null ? null : uuid(a.project_id), limit: Math.min(limit, maxMeetings) };
    }
    default:
      return { tool: name as "get_summary", clientId: uuid(a.client_id), meetingId: uuid(a.meeting_id) };
  }
}
