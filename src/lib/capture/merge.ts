import type { TranscriptEntry } from "@/lib/capture/session";

type Segment = Extract<TranscriptEntry, { kind: "segment" }>;

/**
 * Joins consecutive lines from the same speaker into one paragraph when the
 * pause between them is at most gapSeconds. Gap markers always break a run.
 */
export function mergeEntries(entries: TranscriptEntry[], gapSeconds: number): TranscriptEntry[] {
  const out: TranscriptEntry[] = [];
  for (const e of entries) {
    const last = out[out.length - 1];
    if (
      e.kind === "segment" &&
      last?.kind === "segment" &&
      last.speaker === e.speaker &&
      e.atSec - last.endSec <= gapSeconds
    ) {
      out[out.length - 1] = { ...last, text: `${last.text} ${e.text}`, endSec: e.endSec } satisfies Segment;
    } else {
      out.push(e);
    }
  }
  return out;
}
