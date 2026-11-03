import { timingSafeEqual } from "node:crypto";
import { loadConfig } from "@/lib/config";
import { purgeExpired } from "@/lib/db/purge";
import { handle, json } from "@/lib/http";
import { logInfo } from "@/lib/log";

export const dynamic = "force-dynamic";

// Called daily by Vercel Cron with "Authorization: Bearer <CRON_SECRET>".
function authorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16 || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  return handle("cron.purge", async () => {
    if (!authorized(request.headers.get("authorization"))) return json({ error: "unauthorized" }, 401);
    const removed = await purgeExpired(loadConfig().retention.audit_log_days);
    logInfo("purge.done", { count: removed });
    return json({ removed });
  });
}
