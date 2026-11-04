// SPEC 5: transcript segments expire a fixed number of days after the meeting ends.

const DAY_MS = 86_400_000;

export function computeExpiresAt(from: Date, days: number): Date {
  if (!Number.isFinite(days) || days <= 0) throw new Error("retention days must be positive");
  return new Date(from.getTime() + days * DAY_MS);
}

export function isPurgeable(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/**
 * Live suggestion cards (SPEC 5): pinned cards follow the summary and never
 * expire; unpinned cards expire like the transcript, counted from the
 * meeting's end, or from now while the meeting is still running.
 */
export function suggestionExpiresAt(pinned: boolean, meetingEndedAt: Date | null, now: Date, days: number): Date | null {
  if (pinned) return null;
  return computeExpiresAt(meetingEndedAt ?? now, days);
}
