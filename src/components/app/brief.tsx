"use client";

import { FileUp, Plus, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { BRIEF_FILE_ACCEPT, briefFileProblem, normalizeBriefText } from "@/lib/brief";
import { sendJson } from "@/lib/client/directory";
import { cn } from "@/lib/utils";

type Amendment = {
  id: string;
  source: "meeting" | "owner";
  text: string;
  createdAt: string;
  dismissed: boolean;
  meetingId: string | null;
  meetingTitle: string | null;
};

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/**
 * The project brief: the owner's original text, then dated amendments added
 * after meetings (and the owner's own notes). The original is never changed
 * automatically; amendments can be dismissed and restored, never rewritten.
 */
export function BriefPanel({ clientId, projectId, maxChars }: { clientId: string; projectId: string; maxChars: number }) {
  const base = `/api/clients/${clientId}/projects/${projectId}`;
  const [brief, setBrief] = useState<string | null | undefined>(undefined);
  const [amendments, setAmendments] = useState<Amendment[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [sheet, setSheet] = useState<"brief" | "note" | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [imported, setImported] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Reads a .md or .txt file into the editor; nothing is saved until Save.
  async function importFile(file: File | undefined) {
    if (!file) return;
    const problem = briefFileProblem(file, maxChars);
    if (problem) return setSheetError(problem);
    const text = normalizeBriefText(await file.text());
    if (text.length > maxChars) return setSheetError(`That file has ${text.length.toLocaleString()} characters; a brief can have up to ${maxChars.toLocaleString()}.`);
    setDraft(text);
    setImported(file.name);
    setSheetError(null);
  }

  const load = useCallback(async () => {
    const res = await fetch(base, { cache: "no-store" });
    if (!res.ok) return setError("Couldn't load the brief.");
    const body = (await res.json()) as { brief: string | null; amendments: Amendment[] };
    setBrief(body.brief);
    setAmendments(body.amendments);
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  async function dismiss(a: Amendment, dismissed: boolean) {
    setAmendments((list) => list.map((x) => (x.id === a.id ? { ...x, dismissed } : x)));
    const res = await sendJson(`/api/clients/${clientId}/amendments/${a.id}`, "PATCH", { dismissed });
    if (!res.ok) {
      setError("Couldn't update that.");
      await load();
    }
  }

  async function save() {
    setBusy(true);
    const res =
      sheet === "brief"
        ? await sendJson(base, "PATCH", { brief: draft })
        : await sendJson(`${base}/amendments`, "POST", { text: draft });
    setBusy(false);
    if (!res.ok) {
      // Shown inside the open sheet, where the owner is looking.
      return setSheetError(res.status === 400
        ? `Too long to save. Keep it under ${maxChars.toLocaleString()} characters.`
        : sheet === "brief" ? "Couldn't save the brief. Check the connection and try again." : "Couldn't add the note.");
    }
    setSheet(null);
    setSheetError(null);
    setImported(null);
    setError(null);
    await load();
  }

  const active = amendments.filter((a) => !a.dismissed);
  const dismissed = amendments.filter((a) => a.dismissed);
  const long = (brief ?? "").length > 280 || (brief ?? "").split("\n").length > 5;

  return (
    <section aria-label="Project brief" className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Brief</h2>
        {brief && (
          <button type="button" className="min-h-9 text-[14px] text-link" onClick={() => { setDraft(brief); setSheet("brief"); }}>
            Edit
          </button>
        )}
      </div>

      {brief === undefined && <p className="text-sm text-muted-foreground">Loading…</p>}
      {brief === null && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-[14px] text-muted-foreground">
            Goals, stakeholders, sensitivities, open questions. Summaries and the live assistant use this to make sense of your meetings.
          </p>
          <button
            type="button"
            onClick={() => { setDraft(""); setSheet("brief"); }}
            className="min-h-10 rounded-xl bg-primary px-4 text-[14px] font-semibold text-primary-foreground"
          >
            Add a brief
          </button>
        </div>
      )}
      {brief && (
        <div>
          <p className={cn("whitespace-pre-line text-[15px] leading-relaxed", !expanded && long && "line-clamp-5")}>{brief}</p>
          {long && (
            <button type="button" className="min-h-9 text-[14px] text-link" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}

      {brief !== undefined && (
        <div className="flex flex-col gap-2 border-t pt-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold">Updates{active.length ? ` · ${active.length}` : ""}</h3>
            <button type="button" className="flex min-h-9 items-center gap-1 text-[14px] text-link" onClick={() => { setDraft(""); setSheet("note"); }}>
              <Plus className="size-4" aria-hidden="true" /> Note
            </button>
          </div>
          {active.length === 0 && (
            <p className="text-[13px] text-muted-foreground">New facts from your meetings are added here automatically. Your brief above is never changed.</p>
          )}
          <ul className="flex flex-col gap-2.5">
            {active.map((a) => (
              <li key={a.id} className="flex items-start gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px] leading-snug">{a.text}</span>
                  <span className="text-xs text-muted-foreground">
                    {shortDate(a.createdAt)} ·{" "}
                    {a.source === "owner" ? "your note" : a.meetingId ? (
                      <Link href={`/m/${clientId}/${a.meetingId}`} className="text-link">{a.meetingTitle ?? "meeting"}</Link>
                    ) : "meeting"}
                  </span>
                </div>
                <button type="button" aria-label="Dismiss this update" onClick={() => dismiss(a, true)} className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                  <X className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          {dismissed.length > 0 && (
            <button type="button" className="min-h-9 self-start text-[13px] text-muted-foreground" onClick={() => setShowDismissed((v) => !v)}>
              {showDismissed ? "Hide" : "Show"} {dismissed.length} dismissed
            </button>
          )}
          {showDismissed && (
            <ul className="flex flex-col gap-2">
              {dismissed.map((a) => (
                <li key={a.id} className="flex items-start gap-2 text-muted-foreground">
                  <span className="flex-1 text-[14px] line-through">{a.text}</span>
                  <button type="button" aria-label="Restore this update" onClick={() => dismiss(a, false)} className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-muted">
                    <RotateCcw className="size-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <Drawer open={sheet !== null} onOpenChange={(o) => { if (!o) { setSheet(null); setSheetError(null); setImported(null); } }} side={sheet === "brief" ? "fullscreen" : "bottom"}>
        <DrawerContent
          title={sheet === "brief" ? "Project brief" : "Add a note"}
          description={sheet === "brief" ? "Goals, stakeholders, sensitivities, open questions. Type it, or load a .md file." : "Saved as a dated update. It can be dismissed later but not edited."}
        >
          <div className={cn("flex flex-col gap-3 pb-2", sheet === "brief" && "h-full")}>
            {sheet === "brief" && (
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => fileRef.current?.click()} className="flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-[14px]">
                  <FileUp className="size-4" aria-hidden="true" /> Upload .md
                </button>
                <input ref={fileRef} type="file" accept={BRIEF_FILE_ACCEPT} className="hidden" onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ""; }} />
                <span className="truncate text-[13px] text-muted-foreground">
                  {imported ? `Loaded ${imported}. Review, then save.` : <span className="hidden [@media(pointer:fine)]:inline">or drop a file on the text box</span>}
                </span>
              </div>
            )}
            <textarea
              autoFocus
              rows={sheet === "brief" ? 14 : 4}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onDragOver={(e) => { if (sheet === "brief") { e.preventDefault(); setDragging(true); } }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                if (sheet !== "brief") return;
                e.preventDefault();
                setDragging(false);
                void importFile(e.dataTransfer.files?.[0]);
              }}
              aria-label={sheet === "brief" ? "Project brief" : "Note"}
              className={cn(
                "rounded-xl border bg-background px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring",
                sheet === "brief" && "min-h-[45dvh] flex-1 font-mono text-[14px] leading-relaxed",
                dragging && "border-link ring-2 ring-link/40",
              )}
            />
            {sheet === "brief" && (
              <p className={cn("text-right text-[12px] tabular-nums", draft.length > maxChars ? "font-semibold text-destructive" : "text-muted-foreground")}>
                {draft.length.toLocaleString()} / {maxChars.toLocaleString()} characters
              </p>
            )}
            {sheetError && <p role="alert" className="text-[14px] text-destructive">{sheetError}</p>}
            <button
              type="button"
              disabled={busy || (sheet === "note" && !draft.trim()) || (sheet === "brief" && draft.length > maxChars)}
              onClick={save}
              className="min-h-12 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-40"
            >
              {busy ? "Saving…" : sheet === "brief" ? "Save brief" : "Add note"}
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    </section>
  );
}
