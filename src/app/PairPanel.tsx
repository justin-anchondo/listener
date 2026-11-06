"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Started = { code: string; expiresAt: string; approveUrl: string; qr: string };
type State = "starting" | "waiting" | "expired" | "busy" | "not_ready" | "error";

/**
 * Sign in on a computer by approving it from the phone (SPEC 6.1). Shows a
 * code and QR, then checks in until the phone approves; the session cookie
 * is set by the server on the check in that succeeds.
 */
export function PairPanel({ onUsePasskey, pollSeconds = 2 }: { onUsePasskey: () => void; pollSeconds?: number }) {
  const [state, setState] = useState<State>("starting");
  const [started, setStarted] = useState<Started | null>(null);
  const [left, setLeft] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(async () => {
    setState("starting");
    const res = await fetch("/api/auth/pair/start", { method: "POST" }).catch(() => null);
    if (!res) return setState("error");
    if (res.status === 429) return setState("busy");
    if (res.status === 503) return setState("not_ready");
    if (!res.ok) return setState("error");
    setStarted((await res.json()) as Started);
    setState("waiting");
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  useEffect(() => {
    if (state !== "waiting" || !started) return;
    const tick = async () => {
      setLeft(Math.max(0, Math.round((new Date(started.expiresAt).getTime() - Date.now()) / 1000)));
      const r = await fetch("/api/auth/pair/claim", { method: "POST" }).then((x) => x.json()).catch(() => null) as { state: string } | null;
      if (r?.state === "signed_in") {
        if (timer.current) clearInterval(timer.current);
        window.location.assign("/live");
      } else if (r?.state === "expired") {
        setState("expired");
      }
    };
    void tick();
    timer.current = setInterval(tick, pollSeconds * 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [state, started, pollSeconds]);

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      {state === "starting" && <p className="text-muted-foreground">Getting a code…</p>}
      {state === "busy" && <p className="text-destructive">Too many sign in codes are waiting. Try again in a couple of minutes.</p>}
      {state === "not_ready" && <p className="text-destructive">Signing in from a computer isn&apos;t set up on the server yet (database update 0007).</p>}
      {state === "error" && <p className="text-destructive">Couldn&apos;t get a code. Check the connection and try again.</p>}
      {state === "waiting" && started && (
        <>
          <p className="text-[17px] font-semibold">Sign in with your phone</p>
          <p className="text-[15px] text-muted-foreground">On your phone, scan this code or open <b className="text-foreground">{new URL(started.approveUrl).host}/pair</b> and enter:</p>
          <p aria-label="Sign in code" className="font-mono text-3xl font-bold tracking-[0.2em]">{started.code}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={started.qr} alt="QR code that opens the approval page on your phone" width={176} height={176} className="rounded-lg bg-white p-2" />
          <p className="text-[13px] text-muted-foreground">Approve with Face ID on the phone. This code expires in {left}s.</p>
        </>
      )}
      {(state === "expired" || state === "busy" || state === "error" || state === "not_ready") && (
        <button type="button" onClick={() => void start()} className="min-h-11 rounded-xl bg-primary px-5 text-[15px] font-semibold text-primary-foreground">
          {state === "expired" ? "Code expired. Get a new one" : "Try again"}
        </button>
      )}
      <button type="button" onClick={onUsePasskey} className="min-h-10 text-[14px] text-muted-foreground">Use a passkey on this computer instead</button>
    </div>
  );
}
