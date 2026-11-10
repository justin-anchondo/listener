"use client";

import { useCallback, useState } from "react";
import type { MeetingRowData } from "@/components/app/meeting-row";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { forget } from "@/lib/client/cache";
import { sendJson } from "@/lib/client/directory";
import { fmtDateTime } from "@/lib/format";

/**
 * Confirm before deleting a meeting. Returns a function rows call with the
 * meeting to delete, and the sheet to render. Nothing is removed until the
 * owner confirms.
 */
export function useDeleteMeeting(onDeleted: (id: string) => void) {
  const [target, setTarget] = useState<MeetingRowData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback((m: MeetingRowData) => {
    setError(null);
    setTarget(m);
  }, []);

  async function confirm() {
    if (!target) return;
    setBusy(true);
    const res = await sendJson(`/api/clients/${target.clientId}/meetings/${target.id}`, "DELETE").catch(() => null);
    setBusy(false);
    if (!res?.ok && res?.status !== 404) return setError("Couldn't delete the meeting. Nothing was removed.");
    forget("/api/meetings/recent");
    forget("/api/open-items");
    forget(`/api/clients/${target.clientId}/meetings/${target.id}`);
    onDeleted(target.id);
    setTarget(null);
  }

  const sheet = (
    <Drawer open={target !== null} onOpenChange={(o) => !o && !busy && setTarget(null)}>
      <DrawerContent title="Delete this meeting?">
        {target && (
          <div className="flex flex-col gap-4 pb-2">
            <div className="rounded-xl bg-surface px-4 py-3">
              <p className="text-[15px] font-semibold">{target.title ?? "No summary yet"}</p>
              <p className="text-[13px] text-muted-foreground">{target.clientName} · {target.projectName} · {fmtDateTime(target.startedAt)}</p>
            </div>
            <p className="text-[14px] text-muted-foreground">
              This deletes its transcript, summary, action items, brief notes, and live tips. It can&apos;t be undone.
            </p>
            {error && <p role="alert" className="text-[14px] text-destructive">{error}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setTarget(null)} disabled={busy} className="min-h-12 rounded-xl border text-[15px] font-medium">Cancel</button>
              <button type="button" onClick={confirm} disabled={busy} className="min-h-12 rounded-xl bg-destructive text-[15px] font-semibold text-white disabled:opacity-50">
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );

  return { ask, sheet };
}
