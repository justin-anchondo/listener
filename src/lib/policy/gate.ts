import { loadConfig } from "@/lib/config";
import { isGateConfigured, verifySession } from "@/lib/policy/access";

/** True when the request carries a valid Phase 1 session cookie. */
export function hasValidSession(cookieValue: string | undefined, nowMs = Date.now()): boolean {
  const { access_gate } = loadConfig();
  const code = process.env.LISTENER_ACCESS_CODE;
  if (!isGateConfigured(code, access_gate.min_code_length)) return false;
  return verifySession(code, cookieValue, nowMs, access_gate.session_hours * 3_600_000);
}
