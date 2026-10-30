import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { SESSION_COOKIE, checkAccessCode, isGateConfigured, signSession } from "@/lib/policy/access";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { access_gate } = loadConfig();
  const expected = process.env.LISTENER_ACCESS_CODE;
  if (!isGateConfigured(expected, access_gate.min_code_length)) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const provided = typeof body?.code === "string" ? body.code : "";
  if (!checkAccessCode(provided, expected)) {
    return NextResponse.json({ error: "invalid" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, signSession(expected, Date.now()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: Math.floor(access_gate.session_hours * 3600),
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
