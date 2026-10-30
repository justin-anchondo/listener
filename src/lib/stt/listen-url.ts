import type { CaptureSettings } from "@/lib/config";

export const DEEPGRAM_LISTEN_URL = "wss://api.deepgram.com/v1/listen";

export function buildListenUrl({ stt, capture }: CaptureSettings): string {
  const params = new URLSearchParams({
    model: stt.model,
    language: stt.language,
    diarize: String(stt.diarize),
    interim_results: String(stt.interim_results),
    smart_format: String(stt.smart_format),
    mip_opt_out: String(stt.mip_opt_out),
    encoding: "linear16",
    sample_rate: String(capture.sample_rate_hz),
    channels: "1",
  });
  return `${DEEPGRAM_LISTEN_URL}?${params}`;
}

/** Browsers cannot set headers on a WebSocket, so the token rides in the subprotocol. */
export function listenProtocols(accessToken: string): string[] {
  return ["bearer", accessToken];
}
