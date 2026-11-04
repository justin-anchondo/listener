"use client";

import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { sendJson } from "@/lib/client/directory";
import { cn } from "@/lib/utils";

type Candidate = { id: string; title: string | null; projectName: string; startedAt: string; endedAt: string | null };

const ERRORS: Record<string, string> = {
  too_far_apart: "Those recordings are too far apart to be one call.",
  no_transcript: "One of the transcripts has already expired, so the summary couldn't be rebuilt.",
  running: "Finish the recording first.",
};

function when(c: Candidate): string {
  const s = new Date(c.startedAt);
  const day = s.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day}, ${t(s)}${c.endedAt ? `–${t(new Date(c.endedAt))}` : ""}`;
}

/**
 * Joins this meeting with another recording of the same call, e.g. after a
 * disconnect. The earlier recording is kept and its summary is rebuilt.
 */
export function MergeSheet({ open, onClose, clientId, meetingId, onMerged }: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  meetingId: string;
  onMerged: (keptId: string) => void;
}) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "merging" | "summarizing">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPicked(null);
    setError(null);
    setState("idle");
    setCandidates(null);
    void fetch(`/api/clients/${clientId}/meetings/${meetingId}/merge`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b: { meetings: Candidate[] }) => setCandidates(b.meetings))
      .catch(() => setError("Couldn't load nearby recordings."));
  }, [open, clientId, meetingId]);

  async function merge() {
    if (!picked) return;
    setState("merging");
    setError(null);
    const res = await sendJson(`/api/clients/${clientId}/meetings/${meetingId}/merge`, "POST", { otherId: picked }).catch(() => null);
    if (!res?.ok) {
      const code = ((await res?.json().catch(() => ({}))) as { error?: string } | undefined)?.error;
      setState("idle");
      return setError(ERRORS[code ?? ""] ?? "Couldn't merge. Nothing was changed.");
    }
    const { meetingId: kept } = (await res.json()) as { meetingId: string };
    setState("summarizing");
    // The merge is done; a failed summary can be retried from the meeting page.
    await sendJson(`/api/clients/${clientId}/meetings/${kept}/summary`, "POST", { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }).catch(() => null);
    onMerged(kept);
  }

  const busy = state !== "idle";

  return (
    <Drawer open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DrawerContent title="Merge recordings" description="For a call that got split by a disconnect.">
        <div className="flex flex-col gap-4 pb-2">
          {!candidates && !error && <p className="text-[15px] text-muted-foreground">Looking for nearby recordings…</p>}
          {candidates?.length === 0 && (
            <p className="text-[15px] text-muted-foreground">No other recordings for this client close enough in time to merge.</p>
          )}
          {candidates && candidates.length > 0 && (
            <>
              <ul className="overflow-hidden rounded-xl bg-surface">
                {candidates.map((c) => (
                  <li key={c.id} className="border-b border-background last:border-b-0">
                    <button
                      type="button"
                      aria-pressed={picked === c.id}
                      disabled={busy}
                      onClick={() => setPicked(c.id)}
                      className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left"
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[15px] font-semibold">{c.title ?? "No summary yet"}</span>
                        <span className="truncate text-[13px] text-muted-foreground">{c.projectName} · {when(c)}</span>
                      </span>
                      <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border", picked === c.id && "border-link bg-link text-white")}>
                        {picked === c.id && <Check className="size-4" aria-hidden="true" />}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                The two recordings become one meeting, kept under the earlier one, with the transcript joined in order. The summary is
                rebuilt from the full call. Completed and edited action items, pinned tips, and brief notes carry over. This can&apos;t be undone.
              </p>
              <button
                type="button"
                onClick={merge}
                disabled={!picked || busy}
                className="min-h-12 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-40"
              >
                {state === "merging" ? "Merging…" : state === "summarizing" ? "Rebuilding the summary…" : "Merge"}
              </button>
            </>
          )}
          {error && <p role="alert" className="text-[14px] text-destructive">{error}</p>}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
