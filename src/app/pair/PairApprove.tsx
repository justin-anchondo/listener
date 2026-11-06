"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import { CheckCircle2, Laptop } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { sendJson } from "@/lib/client/directory";

type Found = { id: string; code: string; device: string; expiresAt: string };

export default function PairApprove({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [found, setFound] = useState<Found | null>(null);
  const [state, setState] = useState<"idle" | "looking" | "approving" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function lookup(c = code) {
    setError(null);
    setState("looking");
    const res = await sendJson("/api/auth/pair/lookup", "POST", { code: c }).catch(() => null);
    setState("idle");
    if (!res?.ok) return setError(res?.status === 400 ? "That doesn't look like a sign in code (8 letters and numbers)." : "No computer is waiting with that code. Codes expire after 2 minutes.");
    setFound((await res.json()) as Found);
  }

  useEffect(() => {
    if (initialCode) void lookup(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function approve() {
    if (!found) return;
    setError(null);
    setState("approving");
    try {
      const options = await (await sendJson("/api/auth/pair/approve/options", "POST")).json();
      const response = await startAuthentication({ optionsJSON: options });
      const res = await sendJson("/api/auth/pair/approve", "POST", { id: found.id, response });
      if (res.ok) return setState("done");
      setError(res.status === 410 ? "That code expired. Get a new one on the computer." : "Face ID wasn't accepted. Try again.");
    } catch {
      setError("Face ID was cancelled. Try again.");
    }
    setState("idle");
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <PageHeader back={{ href: "/", label: "Record" }} title="Sign in a computer" />
      <main className="flex flex-col gap-5 px-5 pt-4 pb-8">
        {state === "done" ? (
          <div role="status" className="flex flex-col items-center gap-3 rounded-xl bg-surface px-5 py-8 text-center">
            <CheckCircle2 className="size-10 text-link" aria-hidden="true" />
            <p className="text-[17px] font-semibold">Approved</p>
            <p className="text-[15px] text-muted-foreground">The computer signs in within a few seconds.</p>
            <Link href="/" className="mt-2 text-[15px] font-semibold text-link">Back to Record</Link>
          </div>
        ) : found ? (
          <>
            <div className="flex flex-col items-center gap-3 rounded-xl bg-surface px-5 py-6 text-center">
              <Laptop className="size-9 text-muted-foreground" aria-hidden="true" />
              <p className="text-[17px] font-semibold">{found.device} wants to sign in</p>
              <p className="font-mono text-2xl font-bold tracking-[0.2em]">{found.code}</p>
              <p className="text-[14px] text-muted-foreground">Approve only if this code is on a computer in front of you right now.</p>
            </div>
            <button type="button" onClick={approve} disabled={state === "approving"} className="min-h-12 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-50">
              {state === "approving" ? "Waiting for Face ID…" : "Approve with Face ID"}
            </button>
            <button type="button" onClick={() => { setFound(null); setCode(""); }} className="min-h-10 text-[14px] text-muted-foreground">Not me, cancel</button>
          </>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void lookup(); }}>
            <p className="text-[15px] text-muted-foreground">On the computer, choose <b className="text-foreground">Sign in with your phone</b>, then enter the code it shows.</p>
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-label="Sign in code"
              placeholder="XXXX-XXXX"
              autoCapitalize="characters"
              autoComplete="off"
              className="min-h-12 rounded-xl border bg-background px-3 text-center font-mono text-xl tracking-[0.2em] outline-none focus:ring-2 focus:ring-ring"
            />
            <button type="submit" disabled={!code.trim() || state === "looking"} className="min-h-12 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-40">
              {state === "looking" ? "Checking…" : "Continue"}
            </button>
          </form>
        )}
        {error && <p role="alert" className="text-[14px] text-destructive">{error}</p>}
      </main>
    </div>
  );
}
