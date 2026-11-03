// Input limits for text the owner types or the phone uploads. Values come from config.

export class LimitError extends Error {
  constructor(readonly field: string) {
    super(`invalid ${field}`);
    this.name = "LimitError";
  }
}

/** Trims and checks a required short text such as a client or project name. */
export function cleanName(value: unknown, max: number, field = "name"): string {
  if (typeof value !== "string") throw new LimitError(field);
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0 || trimmed.length > max) throw new LimitError(field);
  return trimmed;
}

/** Optional longer text such as a project brief. Empty becomes null. */
export function cleanText(value: unknown, max: number, field = "text"): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > max) throw new LimitError(field);
  return value.trim() === "" ? null : value;
}

export type SegmentInput = { seq: number; speaker: number | null; startMs: number; endMs: number; text: string };

/** Validates a batch of final segments posted by the phone. */
export function cleanSegments(value: unknown, maxCount: number, maxChars: number): SegmentInput[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxCount) throw new LimitError("segments");
  return value.map((raw) => {
    const s = raw as Partial<SegmentInput>;
    const int = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 0;
    if (!int(s.seq) || !int(s.startMs) || !int(s.endMs) || (s.endMs as number) < (s.startMs as number)) {
      throw new LimitError("segments");
    }
    if (!(s.speaker === null || int(s.speaker))) throw new LimitError("segments");
    if (typeof s.text !== "string" || s.text.length === 0 || s.text.length > maxChars) throw new LimitError("segments");
    return { seq: s.seq!, speaker: s.speaker ?? null, startMs: s.startMs!, endMs: s.endMs!, text: s.text };
  });
}
