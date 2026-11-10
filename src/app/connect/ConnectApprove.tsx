"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import { Eye, FileText, Lock, ShieldCheck, Users } from "lucide-react";
import { useState } from "react";
import { sendJson } from "@/lib/client/directory";

/** Approve or deny an AI tool's read-only access, with a fresh Face ID check. */
export default function ConnectApprove({ request, toolName, host }: { request: Record<string, unknown>; toolName: string; host: string }) {
  const [state, setState] = useState<"idle" | "working" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function answer(approve: boolean) {
    setError(null);
    setState("working");
    try {
      let response: unknown;
      if (approve) {
        const options = await (await sendJson("/api/oauth/authorize/options", "POST")).json();
        response = await startAuthentication({ optionsJSON: options });
      }
      const res = await sendJson("/api/oauth/authorize", "POST", { request, approve, response });
      const body = (await res.json().catch(() => ({}))) as { redirect?: string; error?: string };
      if (!res.ok || !body.redirect) {
        setState("idle");
        return setError(body.error === "verification_failed" ? "Face ID didn't match. Try again." : "Couldn't finish. Start again from the AI tool.");
      }
      setState("done");
      window.location.assign(body.redirect);
    } catch {
      setState("idle");
      setError("Face ID was cancelled.");
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-foreground text-background">
          <ShieldCheck className="size-7" aria-hidden="true" />
        </span>
        <h1 className="text-[22px] font-bold tracking-tight">Connect {toolName}?</h1>
        <p className="text-[14px] text-muted-foreground">It will return to {host}.</p>
      </div>
      <ul className="flex flex-col gap-3 rounded-2xl border bg-card p-4 text-[14px]">
        <li className="flex gap-3"><Users className="mt-0.5 size-4 shrink-0" aria-hidden="true" />Can read your clients, projects, and meetings.</li>
        <li className="flex gap-3"><FileText className="mt-0.5 size-4 shrink-0" aria-hidden="true" />Can read full transcripts (still within 30 days), including what others said, and summaries.</li>
        <li className="flex gap-3"><Eye className="mt-0.5 size-4 shrink-0" aria-hidden="true" />Read only: it can&apos;t change or delete anything. Every read is logged.</li>
        <li className="flex gap-3"><Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />Disconnect any time from Connected tools.</li>
      </ul>
      {error && <p role="alert" className="text-center text-[14px] text-destructive">{error}</p>}
      <div className="flex flex-col gap-2">
        <button type="button" disabled={state !== "idle"} onClick={() => void answer(true)} className="min-h-12 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-50">
          {state === "working" ? "Waiting for Face ID…" : state === "done" ? "Connected. Returning…" : "Approve with Face ID"}
        </button>
        <button type="button" disabled={state !== "idle"} onClick={() => void answer(false)} className="min-h-12 rounded-xl text-[15px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-50">
          Deny
        </button>
      </div>
    </main>
  );
}
