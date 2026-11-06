"use client";

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { Mic } from "lucide-react";
import { useEffect, useState } from "react";
import { PairPanel } from "./PairPanel";

type Mode = "loading" | "signin" | "pair" | "setup" | "error";

async function post(url: string, body?: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export default function SignIn() {
  const [mode, setMode] = useState<Mode>("loading");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((s: { setUp: boolean }) => setMode(s.setUp ? "signin" : "setup"))
      .catch(() => setMode("error"));
  }, []);

  async function signIn() {
    setBusy(true);
    setMessage(null);
    try {
      const options = await (await post("/api/auth/login/options")).json();
      const response = await startAuthentication({ optionsJSON: options });
      const res = await post("/api/auth/login/verify", { response });
      if (res.ok) return window.location.reload();
      setMessage("That passkey wasn't accepted.");
    } catch {
      setMessage("Sign in was cancelled or failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function setUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await post("/api/auth/enroll/options", { code });
      if (res.status === 401) return setMessage("That access code didn't work.");
      if (res.status === 403) return setMode("signin");
      if (res.status === 503) return setMessage("The access code isn't set up on the server.");
      if (!res.ok) return setMessage("Setup failed. Try again.");
      const response = await startRegistration({ optionsJSON: await res.json() });
      const done = await post("/api/auth/enroll/verify", { response });
      if (done.ok) return window.location.reload();
      setMessage("Face ID setup wasn't accepted. Try again.");
    } catch {
      setMessage("Setup was cancelled or failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-6 pt-safe pb-safe">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid size-16 place-items-center rounded-full border-[6px] border-accent bg-primary text-primary-foreground">
          <Mic className="size-7" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-bold tracking-tight">Listener</h1>
      </div>
      {mode === "loading" && <p className="text-center text-muted-foreground">Loading…</p>}
      {mode === "error" && <p className="text-center text-destructive">Can&apos;t reach the server. Check the connection and reload.</p>}
      {mode === "signin" && (
        <div className="flex flex-col gap-3">
          <button type="button" onClick={signIn} disabled={busy} className="min-h-12 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-50">
            {busy ? "Waiting for Face ID…" : "Sign in with Face ID"}
          </button>
          <button type="button" onClick={() => { setMessage(null); setMode("pair"); }} className="min-h-12 rounded-xl border text-[15px] font-medium">
            On a computer? Sign in with your phone
          </button>
        </div>
      )}
      {mode === "pair" && <PairPanel onCancel={() => setMode("signin")} />}
      {mode === "setup" && (
        <form onSubmit={setUp} className="flex flex-col gap-3">
          <p className="text-[15px] text-muted-foreground">First time here. Enter your access code to set up Face ID sign in on this device.</p>
          <label htmlFor="code" className="text-[13px] text-muted-foreground">Access code</label>
          <input
            id="code"
            type="password"
            autoComplete="current-password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
            className="min-h-12 rounded-xl border bg-background px-3 text-base outline-none focus:ring-2 focus:ring-ring"
          />
          <button type="submit" disabled={busy || code.length === 0} className="min-h-12 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-50">
            {busy ? "Waiting for Face ID…" : "Set up Face ID"}
          </button>
        </form>
      )}
      {message && <p className="text-center text-sm text-destructive" role="alert">{message}</p>}
    </main>
  );
}
