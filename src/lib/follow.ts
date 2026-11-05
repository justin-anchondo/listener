// Following a live meeting from a second screen (SPEC 4.5).

/** A meeting can be followed while it is running and started within maxHours. */
export function isFollowable(startedAt: Date, endedAt: Date | null, now: Date, maxHours: number): boolean {
  if (endedAt) return false;
  const age = now.getTime() - startedAt.getTime();
  return age >= 0 && age <= maxHours * 3_600_000;
}

/** Parses the ?after= sequence cursor: a non-negative integer, or -1 for "from the start". */
export function parseAfterSeq(value: string | null): number {
  if (value === null || value === "") return -1;
  const n = Number(value);
  return Number.isInteger(n) && n >= -1 ? n : -1;
}
