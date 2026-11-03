import { loginOptions } from "@/lib/auth/passkey";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST() {
  return handle("auth.login.options", async () => json(await loginOptions()));
}
