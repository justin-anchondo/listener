import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { speakingPatterns } from "@/lib/assist/coaching";
import {
  OAuthError, bearerToken, canRedeemCode, canRefresh, cleanAuthorizeRequest, cleanRedirectUri, cleanRegistration,
  cleanToolCall, grantState, hashToken, newToken, redirectWith, tokenLifetimes, verifyPkce,
} from "@/lib/policy/connector";

const hosts = ["claude.ai", "claude.com"];
const verifier = "a".repeat(20) + "B".repeat(23) + "-._~";
const challenge = createHash("sha256").update(verifier).digest("base64url");
const now = new Date("2026-11-10T12:00:00Z");
const later = (s: number) => new Date(now.getTime() + s * 1000);

describe("connector OAuth rules", () => {
  it("checks PKCE S256 and refuses bad verifiers", () => {
    expect(verifyPkce(verifier, challenge)).toBe(true);
    expect(verifyPkce(`${verifier}x`, challenge)).toBe(false);
    expect(verifyPkce("short", challenge)).toBe(false);
    expect(verifyPkce(undefined, challenge)).toBe(false);
  });

  it("allows redirects only to Claude over https, or to this machine", () => {
    expect(cleanRedirectUri("https://claude.ai/api/mcp/auth_callback", hosts)).toBe("https://claude.ai/api/mcp/auth_callback");
    expect(cleanRedirectUri("http://localhost:6274/callback", hosts)).toBe("http://localhost:6274/callback");
    for (const bad of ["http://claude.ai/cb", "https://evil.com/cb", "https://claude.ai.evil.com/cb", "https://evilclaude.ai/cb", "javascript:alert(1)", "https://u:p@claude.ai/cb", "https://claude.ai/cb#x", 5]) {
      expect(() => cleanRedirectUri(bad, hosts)).toThrow(OAuthError);
    }
  });

  it("registers public clients only, with a cleaned name", () => {
    expect(cleanRegistration({ client_name: "Claude\u0007", redirect_uris: ["https://claude.ai/cb"] }, hosts)).toEqual({ name: "Claude", redirectUris: ["https://claude.ai/cb"] });
    expect(() => cleanRegistration({ redirect_uris: ["https://claude.ai/cb"], token_endpoint_auth_method: "client_secret_basic" }, hosts)).toThrow(OAuthError);
    expect(() => cleanRegistration({ redirect_uris: [] }, hosts)).toThrow(OAuthError);
    expect(() => cleanRegistration({ redirect_uris: ["https://claude.ai/cb"], grant_types: ["client_credentials"] }, hosts)).toThrow(OAuthError);
  });

  it("only authorizes registered redirects with an S256 challenge", () => {
    const q = { response_type: "code", client_id: "abc", redirect_uri: "https://claude.ai/cb", code_challenge: challenge, code_challenge_method: "S256", state: "xyz" };
    expect(cleanAuthorizeRequest(q, ["https://claude.ai/cb"])).toEqual({ clientId: "abc", redirectUri: "https://claude.ai/cb", codeChallenge: challenge, state: "xyz" });
    expect(() => cleanAuthorizeRequest(q, null)).toThrow(/invalid_client/);
    expect(() => cleanAuthorizeRequest(q, ["https://claude.ai/other"])).toThrow(/invalid_redirect_uri/);
    expect(() => cleanAuthorizeRequest({ ...q, code_challenge_method: "plain" }, ["https://claude.ai/cb"])).toThrow(OAuthError);
    expect(() => cleanAuthorizeRequest({ ...q, response_type: "token" }, ["https://claude.ai/cb"])).toThrow(OAuthError);
    expect(redirectWith("https://claude.ai/cb?a=1", { code: "c", state: null })).toBe("https://claude.ai/cb?a=1&code=c");
  });

  it("redeems a code once, in time, for the same client, redirect, and verifier", () => {
    const code = { oauthClientId: "abc", redirectUri: "https://claude.ai/cb", codeChallenge: challenge, expiresAt: later(120), usedAt: null };
    const req = { clientId: "abc", redirectUri: "https://claude.ai/cb", verifier };
    expect(canRedeemCode(code, req, now)).toBe(true);
    expect(canRedeemCode({ ...code, usedAt: now }, req, now)).toBe(false);
    expect(canRedeemCode(code, req, later(121))).toBe(false);
    expect(canRedeemCode(code, { ...req, clientId: "other" }, now)).toBe(false);
    expect(canRedeemCode(code, { ...req, redirectUri: "https://claude.ai/x" }, now)).toBe(false);
    expect(canRedeemCode(code, { ...req, verifier: "b".repeat(43) }, now)).toBe(false);
    expect(canRedeemCode(null, req, now)).toBe(false);
  });

  it("knows when a grant is active, expired, or revoked, and when it can refresh", () => {
    const life = tokenLifetimes(now, { access_token_minutes: 60, refresh_token_days: 30 });
    const g = { id: "g", accessExpiresAt: life.accessExpiresAt, refreshExpiresAt: life.refreshExpiresAt, revokedAt: null };
    expect(life.expiresIn).toBe(3600);
    expect(grantState(g, now)).toBe("active");
    expect(grantState(g, later(3601))).toBe("expired");
    expect(grantState({ ...g, revokedAt: now }, now)).toBe("revoked");
    expect(grantState(null, now)).toBe("missing");
    expect(canRefresh(g, later(3601))).toBe(true);
    expect(canRefresh({ ...g, revokedAt: now }, now)).toBe(false);
    expect(canRefresh(g, later(31 * 86400))).toBe(false);
  });

  it("reads bearer tokens and hashes them", () => {
    const t = newToken();
    expect(bearerToken(`Bearer ${t}`)).toBe(t);
    expect(bearerToken(`Basic ${t}`)).toBeNull();
    expect(bearerToken(null)).toBeNull();
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).not.toContain(t);
  });

  it("validates tool calls: one client per call, ids only", () => {
    const c = "11111111-1111-4111-8111-111111111111";
    const m = "22222222-2222-4222-8222-222222222222";
    expect(cleanToolCall("list_clients", {}, 100)).toEqual({ tool: "list_clients" });
    expect(cleanToolCall("list_meetings", { client_id: c, limit: 500 }, 100)).toEqual({ tool: "list_meetings", clientId: c, projectId: null, limit: 100 });
    expect(cleanToolCall("get_transcript", { client_id: c.toUpperCase(), meeting_id: m }, 100)).toEqual({ tool: "get_transcript", clientId: c, meetingId: m });
    expect(() => cleanToolCall("get_transcript", { client_id: c }, 100)).toThrow(OAuthError);
    expect(() => cleanToolCall("list_meetings", {}, 100)).toThrow(OAuthError);
    expect(() => cleanToolCall("delete_meeting", { client_id: c }, 100)).toThrow(OAuthError);
  });
});

describe("speaking patterns", () => {
  it("counts pace, turns, questions, fillers, and cut-ins per speaker", () => {
    const seg = (speaker: number, startMs: number, endMs: number, text: string) => ({ speaker, startMs, endMs, text });
    const out = speakingPatterns([
      seg(0, 0, 10_000, "Um so basically we like need the proposal, you know?"),
      seg(0, 10_000, 20_000, "And the timeline is um fixed."),
      seg(1, 19_000, 25_000, "Sure. What budget?"),
      seg(0, 25_000, 30_000, "Forty."),
    ], { "0": "Me", "1": "Dana" }, ["um", "basically", "like", "you know"]);
    const me = out.find((s) => s.label === "Me")!;
    const dana = out.find((s) => s.label === "Dana")!;
    expect(me.talkSeconds).toBe(25);
    expect(me.turns).toBe(2);
    expect(me.longestTurnSeconds).toBe(20);
    expect(me.questions).toBe(1);
    expect(me.fillers.total).toBe(5);
    expect(me.fillers.top[0]).toEqual({ word: "um", count: 2 });
    expect(me.wordsPerMinute).toBe(Math.round(me.words / (25 / 60)));
    expect(dana.cutIns).toBe(1);
    expect(dana.wordsPerMinute).toBeNull(); // under ten seconds of talk
    expect(out[0].label).toBe("Me");
  });
});
