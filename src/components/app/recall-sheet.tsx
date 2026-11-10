"use client";

import { FileText, RotateCcw, Sparkles, Users } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PromptInput } from "@/components/app/prompt-input";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { sendJson } from "@/lib/client/directory";
import { useVoiceInput } from "@/lib/client/voice-input";
import type { CaptureSettings } from "@/lib/config";
import { cn } from "@/lib/utils";

type Source = { ref: string; kind: "meeting" | "project"; label: string; date: string | null; meetingId: string | null };
type Exchange = { id: number; question: string; state: "asking" | "done" | "error"; found?: boolean; answer?: string; sources?: Source[]; error?: string };

const HINT_KEY = "listener.askHintSeen"; // per device: the explainer shows until the first question
const VERB_EVERY_MS = 1800;

// What the assistant is "doing" while the answer comes back.
const THINKING = [
  "Rummaging through meetings",
  "Connecting the dots",
  "Skimming the brief",
  "Cross-checking notes",
  "Following the thread",
  "Untangling who said what",
  "Pulling the receipts",
  "Consulting past calls",
  "Piecing it together",
  "Double-checking dates",
];

const ERRORS: Record<string, string> = {
  not_configured: "Recall needs ANTHROPIC_API_KEY on the server.",
  rate_limited: "Too many requests right now. Try again in a moment.",
  refused: "The model declined to answer that.",
};

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function suggestionsFor(clientName: string): string[] {
  return [
    "What did we agree on pricing?",
    `What's still open with ${clientName}?`,
    "What did they say about the timeline?",
    "Recap the last meeting",
  ];
}

function AssistantAvatar({ pulsing }: { pulsing?: boolean }) {
  const reduced = useReducedMotion();
  return (
    <span className="relative mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 via-fuchsia-500 to-sky-500 text-white">
      {pulsing && !reduced && (
        <motion.span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-fuchsia-500/40"
          animate={{ scale: [1, 1.7], opacity: [0.6, 0] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <Sparkles className="relative size-3.5" aria-hidden="true" />
    </span>
  );
}

/** Shimmering status with a rotating verb, while waiting for an answer. */
function Thinking({ clientName }: { clientName: string }) {
  const reduced = useReducedMotion();
  const [i, setI] = useState(() => Math.floor(Math.random() * THINKING.length));
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % THINKING.length), VERB_EVERY_MS);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-3" role="status" aria-label={`Looking through ${clientName}'s meetings`}>
      <AssistantAvatar pulsing />
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={i}
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? undefined : { opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
        >
          <TextShimmer className="text-[15px] font-medium">{THINKING[i]}…</TextShimmer>
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

/**
 * Ask about one client (SPEC 4.2), as a chat. Before the first question the
 * input sits mid screen with suggestions; after it, the conversation fills
 * the screen and the input stays at the bottom. Answers come only from this
 * client's meetings, briefs, and action items, with sources. While
 * recording, sources aren't links, so the recording screen stays put.
 */
export function RecallSheet({ open, onClose, clientId, clientName, linkSources, voiceSettings }: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  linkSources: boolean;
  /** Capture settings enable dictation; left out while a recording already uses the mic. */
  voiceSettings?: CaptureSettings;
}) {
  const reduced = useReducedMotion();
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<Exchange[]>([]);
  const [hintSeen, setHintSeen] = useState(true);
  const seq = useRef(0);
  const end = useRef<HTMLDivElement>(null);
  const voice = useVoiceInput(voiceSettings, (text) => setQuestion((q) => (q ? `${q} ${text}` : text)));

  useEffect(() => {
    try {
      setHintSeen(localStorage.getItem(HINT_KEY) === "1");
    } catch {
      setHintSeen(false);
    }
  }, []);

  useEffect(() => {
    if (!open) voice.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => setHistory([]), [clientId]);

  // Keep the newest message in view.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: reduced ? "auto" : "smooth" });
  }, [history, reduced]);

  async function ask(text = question) {
    voice.stop();
    const q = text.trim();
    if (!q) return;
    if (!hintSeen) {
      setHintSeen(true);
      try {
        localStorage.setItem(HINT_KEY, "1");
      } catch {
        // storage unavailable; the hint just shows again next time
      }
    }
    const id = ++seq.current;
    setQuestion("");
    setHistory((h) => [...h, { id, question: q, state: "asking" }]);
    const patch = (p: Partial<Exchange>) => setHistory((h) => h.map((x) => (x.id === id ? { ...x, ...p } : x)));
    try {
      const res = await sendJson(`/api/clients/${clientId}/recall`, "POST", { question: q });
      const body = (await res.json().catch(() => ({}))) as { found?: boolean; answer?: string; sources?: Source[]; error?: string };
      if (!res.ok) return patch({ state: "error", error: ERRORS[body.error ?? ""] ?? "Couldn't get an answer." });
      patch({ state: "done", found: body.found, answer: body.answer, sources: body.sources ?? [] });
    } catch {
      patch({ state: "error", error: "Lost connection." });
    }
  }

  const started = history.length > 0;
  const input = (
    <>
      <PromptInput value={question} onChange={setQuestion} onSubmit={() => void ask()} placeholder={started ? "Ask a follow-up" : "Ask anything about this client"} voice={voice} />
      {voice.error && <p role="alert" className="mt-2 text-[13px] text-destructive">{voice.error}</p>}
    </>
  );

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()} side="fullscreen">
      <DrawerContent title={`Ask about ${clientName}`}>
        <div className="flex flex-1 flex-col">
          {!started ? (
            // Before the first question: welcome, suggestions, and the input mid screen.
            <div className="flex flex-1 flex-col justify-center gap-5 pb-10">
              <div className="flex flex-col items-center gap-3 text-center">
                <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-sky-500 text-white shadow-lg shadow-fuchsia-500/20">
                  <Sparkles className="size-6" aria-hidden="true" />
                </span>
                <p className="text-[19px] font-semibold">What do you want to know?</p>
                {!hintSeen && (
                  <p className="max-w-xs text-[13px] text-muted-foreground">
                    Answers come only from {clientName}&apos;s meetings, briefs, and action items, with the meetings they came from.
                  </p>
                )}
              </div>
              {input}
              <div className="flex flex-wrap justify-center gap-2" aria-label="Suggestions">
                {suggestionsFor(clientName).map((s) => (
                  <button key={s} type="button" onClick={() => void ask(s)} className="min-h-9 rounded-full border bg-card px-3.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            // The conversation, oldest first, with the input pinned to the bottom.
            <>
              <ol className="flex flex-1 flex-col gap-6 pb-6" aria-label="Conversation">
                {history.map((x) => (
                  <li key={x.id} className="flex flex-col gap-3">
                    <motion.p
                      initial={reduced ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-foreground px-4 py-2.5 text-[15px] leading-snug text-background"
                    >
                      {x.question}
                    </motion.p>
                    {x.state === "asking" ? (
                      <Thinking clientName={clientName} />
                    ) : (
                      <motion.div initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3">
                        <AssistantAvatar />
                        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                          {x.state === "error" && (
                            <p className="text-[15px] text-destructive">
                              {x.error}{" "}
                              <button type="button" onClick={() => void ask(x.question)} className="inline-flex items-center gap-1 font-medium text-link">
                                <RotateCcw className="size-3.5" aria-hidden="true" /> Try again
                              </button>
                            </p>
                          )}
                          {x.state === "done" && !x.found && (
                            <p className="text-[15px] leading-relaxed text-muted-foreground">
                              I couldn&apos;t find that in {clientName}&apos;s meetings, briefs, or action items.
                            </p>
                          )}
                          {x.state === "done" && x.found && (
                            <>
                              <p className="text-[15px] leading-relaxed">{x.answer}</p>
                              {x.sources && x.sources.length > 0 && (
                                <ul className="flex flex-wrap gap-1.5" aria-label="Sources">
                                  {x.sources.map((s) => {
                                    const Icon = s.kind === "meeting" ? Users : FileText;
                                    const chip = cn("flex min-h-8 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-[12px]", linkSources && s.meetingId ? "text-link hover:bg-muted" : "text-muted-foreground");
                                    const body = (
                                      <>
                                        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                                        <span className="truncate">{s.label}</span>
                                        {s.date && <span className="shrink-0 opacity-70">· {fmtDate(s.date)}</span>}
                                      </>
                                    );
                                    return (
                                      <li key={s.ref} className="max-w-full">
                                        {linkSources && s.meetingId ? <Link href={`/m/${clientId}/${s.meetingId}`} className={chip}>{body}</Link> : <span className={chip}>{body}</span>}
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </li>
                ))}
              </ol>
              <div ref={end} />
              <div className="sticky bottom-0 -mx-5 mt-auto bg-gradient-to-t from-card via-card to-card/0 px-5 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-4">
                {input}
              </div>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
