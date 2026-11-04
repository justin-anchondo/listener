// Merging two recordings of the same call after a disconnect. The earlier
// meeting is kept and the later one is joined onto it. Scoping (same client)
// is enforced by running the merge inside one client's scope; these rules
// decide whether two meetings may merge and how the later one's timeline
// shifts.

export class MergeError extends Error {
  constructor(readonly reason: "same_meeting" | "running" | "no_transcript" | "too_far_apart") {
    super(`cannot merge: ${reason}`);
    this.name = "MergeError";
  }
}

export type MergeSide = { id: string; startedAt: Date; endedAt: Date | null; hasTranscript: boolean };

export type MergePlan = {
  keep: string;
  drop: string;
  /** Added to the dropped meeting's segment times so they follow on in the kept meeting's timeline. */
  offsetMs: number;
  endedAt: Date;
};

/**
 * Both meetings must have ended, still have their transcripts (so the
 * summary can be rebuilt), and lie within windowMs of each other: the gap
 * between one's end and the other's start.
 */
export function planMerge(a: MergeSide, b: MergeSide, windowMs: number): MergePlan {
  if (a.id === b.id) throw new MergeError("same_meeting");
  if (!a.endedAt || !b.endedAt) throw new MergeError("running");
  if (!a.hasTranscript || !b.hasTranscript) throw new MergeError("no_transcript");
  const [first, second] = a.startedAt.getTime() <= b.startedAt.getTime() ? [a, b] : [b, a];
  const gap = second.startedAt.getTime() - first.endedAt!.getTime();
  if (gap > windowMs) throw new MergeError("too_far_apart");
  return {
    keep: first.id,
    drop: second.id,
    offsetMs: second.startedAt.getTime() - first.startedAt.getTime(),
    endedAt: new Date(Math.max(first.endedAt!.getTime(), second.endedAt!.getTime())),
  };
}

/** True when another meeting is close enough in time to offer as a merge candidate. */
export function isMergeCandidate(self: MergeSide, other: MergeSide, windowMs: number): boolean {
  try {
    planMerge(self, other, windowMs);
    return true;
  } catch {
    return false;
  }
}
