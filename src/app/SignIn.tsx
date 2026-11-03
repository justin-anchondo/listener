"use client";

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { useEffect, useState } from "react";

type Mode = "loading" | "signin" | "setup" | "error";

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
    <main className="gate">
      <h1>Listener</h1>
      {mode === "loading" && <p className="muted">Loading…</p>}
      {mode === "error" && <p className="error">Can&apos;t reach the server. Check the connection and reload.</p>}
      {mode === "signin" && (
        <div className="stack">
          <button onClick={signIn} disabled={busy}>{busy ? "Waiting for Face ID…" : "Sign in with Face ID"}</button>
        </div>
      )}
      {mode === "setup" && (
        <form onSubmit={setUp} className="stack">
          <p className="muted">First time here. Enter your access code to set up Face ID sign in on this device.</p>
          <label htmlFor="code">Access code</label>
          <input
            id="code"
            type="password"
            autoComplete="current-password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
          />
          <button type="submit" disabled={busy || code.length === 0}>
            {busy ? "Waiting for Face ID…" : "Set up Face ID"}
          </button>
        </form>
      )}
      {message && <p className="error" role="alert">{message}</p>}
    </main>
  );
}
