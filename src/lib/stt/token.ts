// Server side only. Exchanges the Deepgram API key for a short lived token the
// phone can use to open one transcription socket (CLAUDE.md rule 8).

export const DEEPGRAM_GRANT_URL = "https://api.deepgram.com/v1/auth/grant";

export type TemporaryToken = { accessToken: string; expiresIn: number };

export class TokenError extends Error {
  constructor(readonly status: number) {
    super(`Deepgram token grant failed with status ${status}`);
  }
}

export async function requestTemporaryToken(
  apiKey: string,
  ttlSeconds: number,
  fetchImpl: typeof fetch = fetch,
): Promise<TemporaryToken> {
  const res = await fetchImpl(DEEPGRAM_GRANT_URL, {
    method: "POST",
    headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl_seconds: ttlSeconds }),
    cache: "no-store",
  });
  if (!res.ok) throw new TokenError(res.status);
  const body = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== "string" || typeof body.expires_in !== "number") {
    throw new TokenError(502);
  }
  // Only these two fields ever leave the server.
  return { accessToken: body.access_token, expiresIn: body.expires_in };
}
