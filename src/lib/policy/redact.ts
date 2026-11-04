// SPEC 6.5 and CLAUDE.md rule 2: logs carry ids, codes, and counts only.
// Anything else is dropped, so a transcript can't reach a log by accident.

const ALLOWED_KEYS = new Set([
  "event", "route", "status", "code", "count", "ms", "attempt", "upstreamStatus",
  "clientId", "projectId", "meetingId", "segments", "reason", "found", "cacheRead", "cacheWrite",
]);

const SAFE_STRING = /^[A-Za-z0-9_.:-]{1,64}$/;

export type LogFields = Record<string, string | number | boolean | null>;

export function redact(fields: Record<string, unknown>): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (typeof value === "number" || typeof value === "boolean" || value === null) out[key] = value;
    else if (typeof value === "string") out[key] = SAFE_STRING.test(value) ? value : "[redacted]";
  }
  return out;
}
