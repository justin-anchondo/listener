// SPEC 5: transcript segments expire a fixed number of days after the meeting ends.

const DAY_MS = 86_400_000;

export function computeExpiresAt(from: Date, days: number): Date {
  if (!Number.isFinite(days) || days <= 0) throw new Error("retention days must be positive");
  return new Date(from.getTime() + days * DAY_MS);
}

export function isPurgeable(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}
