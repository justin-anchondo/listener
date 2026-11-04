"use client";

import { ArrowUp, FileText, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { sendJson } from "@/lib/client/directory";

type Source = { ref: string; kind: "meeting" | "project"; label: string; date: string | null; meetingId: string | null };
type Exchange = { id: number; question: string; state: "asking" | "done" | "error"; found?: boolean; answer?: string; sources?: Source[]; error?: string };

const ERRORS: Record<string, string> = {
  not_configured: "Recall needs ANTHROPIC_API_KEY on the server.",
  rate_limited: "Too many requests right now. Try again in a moment.",
  refused: "The model declined to answer that.",
};

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Ask about one client (SPEC 4.2). Answers come only from that client's
 * meetings, briefs, and action items, with sources. While recording, sources
 * are shown without links so the recording screen stays put.
 */
export function RecallSheet({ open, onClose, clientId, clientName, linkSources }: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  linkSources: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<Exchange[]>([]);
  const seq = useRef(0);

  useEffect(() => setHistory([]), [clientId]);

  async function ask() {
    const q = question.trim();
    if (!q) return;
    const id = ++seq.current;
    setQuestion("");
    setHistory((h) => [{ id, question: q, state: "asking" }, ...h]);
    const patch = (p: Partial<Exchange>) => setHistory((h) => h.map((x) => (x.id === id ? { ...x, ...p } : x)));
    try {
      const res = await sendJson(`/api/clients/${clientId}/recall`, "POST", { question: q });
      const body = (await res.json().catch(() => ({}))) as { found?: boolean; answer?: string; sources?: Source[]; error?: string };
      if (!res.ok) return patch({ state: "error", error: ERRORS[body.error ?? ""] ?? "Couldn't get an answer. Try again." });
      patch({ state: "done", found: body.found, answer: body.answer, sources: body.sources ?? [] });
    } catch {
      patch({ state: "error", error: "Lost connection. Try again." });
    }
  }

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent title={`Ask about ${clientName}`}>
        <div className="flex flex-col gap-4 pb-2">
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
            <input
              autoFocus
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              enterKeyHint="send"
              aria-label="Question"
              placeholder="What did we agree on pricing?"
              className="min-h-11 min-w-0 flex-1 rounded-xl border bg-background px-3 text-base outline-none focus:ring-2 focus:ring-ring"
            />
            <button type="submit" disabled={!question.trim()} aria-label="Ask" className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40">
              <ArrowUp className="size-5" aria-hidden="true" />
            </button>
          </form>
          {history.length === 0 && (
            <p className="text-[13px] text-muted-foreground">
              Answers come only from {clientName}&apos;s meetings, briefs, and action items, with the meetings they came from.
            </p>
          )}
          <ul className="flex flex-col gap-4">
            {history.map((x) => (
              <li key={x.id} className="flex flex-col gap-2">
                <p className="self-end rounded-2xl rounded-br-md bg-muted px-3.5 py-2 text-[15px]">{x.question}</p>
                <div role="status" className="rounded-xl bg-surface px-4 py-3 text-[15px] leading-relaxed">
                  {x.state === "asking" && <span className="text-muted-foreground">Looking through {clientName}&apos;s meetings…</span>}
                  {x.state === "error" && <span className="text-destructive">{x.error}</span>}
                  {x.state === "done" && !x.found && (
                    <span className="text-muted-foreground">Not found in {clientName}&apos;s meetings, briefs, or action items.</span>
                  )}
                  {x.state === "done" && x.found && (
                    <>
                      <p>{x.answer}</p>
                      {x.sources && x.sources.length > 0 && (
                        <ul className="mt-2 flex flex-col gap-1 border-t border-background pt-2">
                          {x.sources.map((s) => {
                            const Icon = s.kind === "meeting" ? Users : FileText;
                            const text = (
                              <>
                                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                                <span className="truncate">{s.label}</span>
                                {s.date && <span className="shrink-0 text-muted-foreground">· {fmtDate(s.date)}</span>}
                              </>
                            );
                            return (
                              <li key={s.ref}>
                                {linkSources && s.meetingId ? (
                                  <Link href={`/m/${clientId}/${s.meetingId}`} className="flex min-h-8 items-center gap-1.5 text-[13px] text-link">{text}</Link>
                                ) : (
                                  <span className="flex min-h-8 items-center gap-1.5 text-[13px]">{text}</span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
