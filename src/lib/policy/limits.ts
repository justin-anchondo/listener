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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Optional YYYY-MM-DD date; null clears it. */
export function cleanDate(value: unknown, field = "date"): string | null {
  if (value === null || value === "" || value === undefined) return null;
  if (typeof value !== "string" || !ISO_DATE.test(value)) throw new LimitError(field);
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new LimitError(field);
  return value;
}

/**
 * Speaker label to name map from the meeting screen, e.g. {"0": "Me", "1": "Dana"}.
 * At most one speaker may be "Me"; empty names are dropped.
 */
export function cleanSpeakerMap(value: unknown, maxChars: number): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new LimitError("speakers");
  const out: Record<string, string> = {};
  for (const [key, name] of Object.entries(value)) {
    if (!/^\d{1,2}$/.test(key) || typeof name !== "string" || name.length > maxChars) throw new LimitError("speakers");
    const n = name.trim().replace(/\s+/g, " ");
    if (n) out[key] = n;
  }
  if (Object.values(out).filter((n) => n === "Me").length > 1) throw new LimitError("speakers");
  return out;
}

/** A list of short strings from an edit form. */
export function cleanList(value: unknown, maxItems: number, maxChars: number, field = "list"): string[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new LimitError(field);
  return value.map((v) => {
    if (typeof v !== "string" || v.length > maxChars) throw new LimitError(field);
    return v.trim();
  }).filter(Boolean);
}
