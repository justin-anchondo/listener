import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { SESSION_COOKIE } from "@/lib/policy/access";
import { hasValidSession } from "@/lib/policy/gate";
import { TokenError, requestTemporaryToken } from "@/lib/stt/token";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function POST() {
  const jar = await cookies();
  if (!hasValidSession(jar.get(SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  }
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "not_configured" }, { status: 503, headers: noStore });
  }

  try {
    const token = await requestTemporaryToken(apiKey, loadConfig().stt.token_ttl_seconds);
    return NextResponse.json(token, { headers: noStore });
  } catch (err) {
    const status = err instanceof TokenError ? err.status : 0;
    console.error("stt token grant failed", { status });
    return NextResponse.json({ error: "upstream" }, { status: 502, headers: noStore });
  }
}
