"use client";

import { useState } from "react";

export default function AccessForm() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    setBusy(false);
    if (res.ok) {
      window.location.reload();
      return;
    }
    setError(res.status === 503 ? "Access code is not set up on the server." : "That code didn't work.");
  }

  return (
    <main className="gate">
      <h1>Listener</h1>
      <form onSubmit={submit}>
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
          {busy ? "Checking…" : "Unlock"}
        </button>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </main>
  );
}
