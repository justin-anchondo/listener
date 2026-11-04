import type { AssistError } from "@/lib/assist/claude";

/** HTTP status for each assist failure; bodies carry the code only, never text. */
export const ASSIST_STATUS: Record<AssistError["code"], number> = {
  not_configured: 503, refused: 422, truncated: 502, invalid: 502, rate_limited: 429, upstream: 502,
};
