import { redact } from "@/lib/policy/redact";

// The only place that writes logs. Every field passes through redact, which
// keeps ids, codes, and counts and drops everything else (CLAUDE.md rule 2).

export function logInfo(event: string, fields: Record<string, unknown> = {}): void {
  console.info(JSON.stringify({ level: "info", ...redact({ ...fields, event }) }));
}

export function logError(event: string, fields: Record<string, unknown> = {}): void {
  console.error(JSON.stringify({ level: "error", ...redact({ ...fields, event }) }));
}
