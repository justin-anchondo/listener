import { countPasskeys } from "@/lib/db/passkeys";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle("auth.status", async () => json({ setUp: (await countPasskeys()) > 0 }));
}
