import { describe, expect, it, vi } from "vitest";
import { DEEPGRAM_GRANT_URL, TokenError, requestTemporaryToken } from "@/lib/stt/token";

const KEY = "dg_secret_key_123";

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe("requestTemporaryToken", () => {
  it("calls the grant endpoint with the key and TTL", async () => {
    const f = fakeFetch(200, { access_token: "jwt", expires_in: 30 });
    await requestTemporaryToken(KEY, 30, f);
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(DEEPGRAM_GRANT_URL);
    expect(init.headers.Authorization).toBe(`Token ${KEY}`);
    expect(JSON.parse(init.body)).toEqual({ ttl_seconds: 30 });
  });

  it("returns only the token and expiry, never the API key", async () => {
    const f = fakeFetch(200, { access_token: "jwt", expires_in: 30, extra: KEY });
    const token = await requestTemporaryToken(KEY, 30, f);
    expect(token).toEqual({ accessToken: "jwt", expiresIn: 30 });
    expect(JSON.stringify(token)).not.toContain(KEY);
  });

  it("throws on upstream errors without including the key", async () => {
    const err = await requestTemporaryToken(KEY, 30, fakeFetch(403, { err: "denied" })).catch((e) => e);
    expect(err).toBeInstanceOf(TokenError);
    expect(err.status).toBe(403);
    expect(String(err.message)).not.toContain(KEY);
  });

  it("throws on a malformed response", async () => {
    await expect(requestTemporaryToken(KEY, 30, fakeFetch(200, { nope: true }))).rejects.toBeInstanceOf(TokenError);
  });
});
