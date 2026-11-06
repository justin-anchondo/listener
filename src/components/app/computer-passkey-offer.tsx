"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { KeyRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { sendJson } from "@/lib/client/directory";
import { computerPasskeyOfferDismissed, computerSignInName, isDesktopBrowser, rememberComputerPasskey } from "@/lib/device";

/**
 * After signing in a computer with the phone, offers to add the computer's
 * own passkey (Windows Hello or Touch ID) so next time it's one click, no
 * phone. Adding a passkey needs a signed in session (SPEC 6.1).
 */
export function ComputerPasskeyOffer() {
  const [show, setShow] = useState(false);
  const [name, setName] = useState("this computer's passkey");
  const [state, setState] = useState<"idle" | "working" | "done" | "failed">("idle");

  useEffect(() => {
    const desktop = isDesktopBrowser({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints ?? 0, finePointer: window.matchMedia("(pointer: fine)").matches });
    setName(computerSignInName(navigator.userAgent));
    setShow(desktop && !computerPasskeyOfferDismissed());
  }, []);

  async function setUp() {
    setState("working");
    try {
      const res = await sendJson("/api/auth/enroll/options", "POST", { device: "computer" });
      if (!res.ok) throw new Error("options");
      const response = await startRegistration({ optionsJSON: await res.json() });
      const done = await sendJson("/api/auth/enroll/verify", "POST", { response });
      if (!done.ok) throw new Error("verify");
      rememberComputerPasskey("1");
      setState("done");
    } catch {
      setState("failed");
    }
  }

  if (!show) return null;
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 border-b bg-accent/40 px-6 py-3 text-[14px]">
      <KeyRound className="size-5 shrink-0 text-link" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        {state === "done" && `Done. Next time, sign in on this computer with ${name}.`}
        {state === "failed" && `${name} couldn't be set up here (your computer may not allow it). You can keep signing in with your phone.`}
        {(state === "idle" || state === "working") && <>Sign in faster next time: use <b>{name}</b> on this computer instead of scanning with your phone.</>}
      </span>
      {(state === "idle" || state === "working") && (
        <button type="button" onClick={setUp} disabled={state === "working"} className="min-h-9 rounded-lg bg-primary px-3.5 text-[14px] font-semibold text-primary-foreground disabled:opacity-50">
          {state === "working" ? "Waiting…" : `Set up ${name}`}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          if (state !== "done") rememberComputerPasskey("dismissed");
          setShow(false);
        }}
        className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
