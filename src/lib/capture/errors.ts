// Error codes for each capture step, so the screen can say which step failed.
// Codes carry no transcript or credential content.

export class CaptureError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CaptureError";
  }
}

/** Maps a getUserMedia failure to a code. */
export function micErrorCode(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "mic_denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "mic_missing";
  if (name === "NotReadableError") return "mic_busy";
  return "mic_failed";
}

/** Maps a token route response to a code. upstreamStatus is Deepgram's status, when known. */
export function tokenErrorCode(status: number, upstreamStatus?: number): string {
  if (status === 401) return "session";
  if (status === 503) return "token_not_configured";
  if (status === 502) return upstreamStatus ? `token_upstream_${upstreamStatus}` : "token_upstream";
  return `token_http_${status}`;
}

const HELP: Record<string, string> = {
  session: "Your session expired. Reload the page and enter the access code.",
  reconnect: "Couldn't reconnect to transcription. Check the connection and tap Resume.",
  mic_denied: "Microphone permission was denied. Allow it in Settings › Apps › Safari › Microphone, then reload.",
  mic_missing: "No microphone found.",
  mic_busy: "The microphone is in use by another app. Close it and tap Resume.",
  mic_failed: "Couldn't open the microphone.",
  audio_engine: "Couldn't start audio processing in the browser. Reload and try again.",
  token_not_configured: "The server is missing its Deepgram key. Add DEEPGRAM_API_KEY in Vercel and redeploy.",
  token_upstream: "Couldn't reach Deepgram from the server. Try again shortly.",
  token_upstream_401: "Deepgram rejected the API key (401). Check DEEPGRAM_API_KEY in Vercel, then redeploy.",
  token_upstream_403: "Deepgram key lacks permission to create temporary tokens (403). Use a key with Member role or higher.",
  network: "No connection to the Listener server. Check Wi-Fi and tap Resume.",
};

export function describeCaptureError(code: string | undefined): string {
  if (code && HELP[code]) return HELP[code];
  return `Something went wrong (${code ?? "unknown"}).`;
}
