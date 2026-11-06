// "Still talking?" prompt during a recording: when nothing has been said
// for a while, ask whether to end. Speech means transcript activity (final
// or interim lines), so background noise doesn't count as talking.

export type SilenceState = { live: boolean; lastSpeechAt: number; snoozedUntil: number };

export function shouldPromptSilence(s: SilenceState, now: number, promptAfterMs: number): boolean {
  if (!s.live || now < s.snoozedUntil) return false;
  return now - s.lastSpeechAt >= promptAfterMs;
}

/** Whole seconds of silence so far, for the prompt's wording. */
export function silentSeconds(lastSpeechAt: number, now: number): number {
  return Math.max(0, Math.floor((now - lastSpeechAt) / 1000));
}
