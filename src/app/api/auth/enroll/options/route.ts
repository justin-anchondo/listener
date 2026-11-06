import { enrollmentOptions } from "@/lib/auth/passkey";
import { UnauthorizedError, hasSession } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { countPasskeys } from "@/lib/db/passkeys";
import { handle, json, readJson } from "@/lib/http";
import { checkAccessCode, isGateConfigured } from "@/lib/policy/access";

export const dynamic = "force-dynamic";

// A new passkey may be added by a signed in owner (another device), or with
// the access code only while no passkey exists yet (first setup).
export async function POST(request: Request) {
  return handle("auth.enroll.options", async () => {
    const body = await readJson(request).catch(() => ({}) as Record<string, unknown>);
    const signedIn = await hasSession();
    if (!signedIn) {
      const expected = process.env.LISTENER_ACCESS_CODE;
      const code = typeof body.code === "string" ? body.code : "";
      if (!isGateConfigured(expected, loadConfig().access_gate.min_code_length)) {
        return json({ error: "not_configured" }, 503);
      }
      if ((await countPasskeys()) > 0) return json({ error: "already_set_up" }, 403);
      if (!checkAccessCode(code, expected)) throw new UnauthorizedError();
    }
    // A signed in computer can add its own Windows Hello or Touch ID passkey.
    return json(await enrollmentOptions(signedIn && body.device === "computer" ? "computer" : "any"));
  });
}
