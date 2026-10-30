// Pure timing helpers for the capture session.

/** How far transcription trails the audio already sent, in ms. */
export function transcriptLagMs(audioSentSec: number, resultEndSec: number): number {
  return Math.max(0, Math.round((audioSentSec - resultEndSec) * 1000));
}

/** Delay before reconnect attempt `attempt` (0 based), or null when attempts are used up. */
export function reconnectDelayMs(attempt: number, maxAttempts: number, scheduleMs: number[]): number | null {
  if (attempt >= maxAttempts) return null;
  return scheduleMs[Math.min(attempt, scheduleMs.length - 1)];
}

export function isStalled(lastFrameAtMs: number, nowMs: number, stallSeconds: number): boolean {
  return nowMs - lastFrameAtMs > stallSeconds * 1000;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
