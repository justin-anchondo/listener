import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { loadConfig } from "@/lib/config";
import { getClientLogo, setClientLogo } from "@/lib/db/directory";
import { handle, json, readJson } from "@/lib/http";
import { cleanLogo } from "@/lib/policy/limits";
import { routeIds } from "@/lib/routeIds";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ clientId: string }> };

/** The logo image, decrypted for the signed in owner only. */
export async function GET(_request: Request, ctx: Ctx) {
  return handle("logo.get", async () => {
    await requireSession();
    const { clientId } = routeIds(await ctx.params);
    const logo = await getClientLogo(clientId);
    if (!logo) return json({ error: "not_found" }, 404);
    return new NextResponse(new Uint8Array(logo.bytes), {
      headers: {
        "Content-Type": logo.mime,
        // Private to this browser; the URL carries a version, so it can be cached.
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  });
}

export async function PUT(request: Request, ctx: Ctx) {
  return handle("logo.set", async () => {
    await requireSession();
    const { clientId } = routeIds(await ctx.params);
    const body = await readJson(request);
    await setClientLogo(clientId, cleanLogo(body.logo, loadConfig().storage.max_logo_bytes));
    return json({ ok: true });
  });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  return handle("logo.delete", async () => {
    await requireSession();
    const { clientId } = routeIds(await ctx.params);
    await setClientLogo(clientId, null);
    return json({ ok: true });
  });
}
