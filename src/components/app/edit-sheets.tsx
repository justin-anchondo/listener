"use client";

import { ChevronRight, ImagePlus, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClientAvatar } from "@/components/app/client-avatar";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { sendJson } from "@/lib/client/directory";
import { resizeLogo } from "@/lib/client/image";
import { cn } from "@/lib/utils";

const field = "min-h-11 w-full min-w-0 rounded-xl border bg-background px-3 text-base outline-none focus:ring-2 focus:ring-ring";
const primary = "min-h-12 w-full rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-40";
const label = "text-[13px] text-muted-foreground";

export type EditableClient = { id: string; name: string; logoVersion: number | null };

/** Client details: name, logo, and delete. */
export function ClientEditSheet({
  client,
  open,
  onClose,
  onChanged,
  onDeleted,
  logoPixels,
}: {
  client: EditableClient;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
  logoPixels: number;
}) {
  const [name, setName] = useState(client.name);
  const [confirm, setConfirm] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(client.name);
    setConfirm("");
    setShowDelete(false);
    setError(null);
  }, [open, client]);

  async function run(p: Promise<Response>, failure: string): Promise<boolean> {
    setBusy(true);
    const res = await p;
    setBusy(false);
    if (!res.ok) setError(failure);
    return res.ok;
  }

  async function pickLogo(file: File | undefined) {
    if (!file) return;
    try {
      const logo = await resizeLogo(file, logoPixels);
      if (await run(sendJson(`/api/clients/${client.id}/logo`, "PUT", { logo }), "Couldn't use that image. Try a PNG or JPEG.")) onChanged();
    } catch {
      setError("Couldn't read that image.");
    }
  }

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent title="Client details">
        <div className="flex flex-col gap-5 pb-2">
          <div className="flex items-center gap-4">
            <ClientAvatar client={client} size={64} />
            <div className="flex flex-col items-start gap-1">
              <button type="button" onClick={() => fileRef.current?.click()} className="flex min-h-10 items-center gap-1.5 text-[15px] text-link">
                <ImagePlus className="size-4" aria-hidden="true" /> {client.logoVersion ? "Change logo" : "Add logo"}
              </button>
              {client.logoVersion && (
                <button
                  type="button"
                  className="min-h-9 text-[14px] text-muted-foreground"
                  onClick={async () => { if (await run(sendJson(`/api/clients/${client.id}/logo`, "DELETE"), "Couldn't remove the logo.")) onChanged(); }}
                >
                  Remove logo
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => pickLogo(e.target.files?.[0])} />
            </div>
          </div>

          <form
            className="flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run(sendJson(`/api/clients/${client.id}`, "PATCH", { name: name.trim() }), "Couldn't rename the client.")) {
                onChanged();
                onClose();
              }
            }}
          >
            <label className="flex flex-col gap-1.5">
              <span className={label}>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
            </label>
            <button type="submit" disabled={busy || !name.trim() || name.trim() === client.name} className={primary}>Save</button>
          </form>

          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

          <div className="border-t pt-3">
            {!showDelete ? (
              <button type="button" onClick={() => setShowDelete(true)} className="min-h-11 text-[15px] text-destructive">Delete client…</button>
            ) : (
              <form
                className="flex flex-col gap-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (confirm.trim() !== client.name) return;
                  if (await run(sendJson(`/api/clients/${client.id}`, "DELETE"), "Couldn't delete the client.")) onDeleted();
                }}
              >
                <p className="text-[14px]">Deletes every project, meeting, summary, action item, and transcript for this client. It can&apos;t be undone.</p>
                <label className="flex flex-col gap-1.5">
                  <span className={label}>Type <strong className="text-foreground">{client.name}</strong> to confirm</span>
                  <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" className={field} />
                </label>
                <button type="submit" disabled={busy || confirm.trim() !== client.name} className="min-h-12 rounded-xl bg-destructive text-[15px] font-semibold text-white disabled:opacity-40">
                  Delete client
                </button>
              </form>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/** Project details: name and archive. The brief is edited on the project page. */
export function ProjectEditSheet({
  clientId,
  project,
  open,
  onClose,
  onChanged,
}: {
  clientId: string;
  project: { id: string; name: string; status: "active" | "archived" };
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setName(project.name); setError(null); } }, [open, project]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    const res = await sendJson(`/api/clients/${clientId}/projects/${project.id}`, "PATCH", body);
    setBusy(false);
    if (!res.ok) return setError("Couldn't update the project.");
    onChanged();
    onClose();
  }

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent title="Project details">
        <form className="flex flex-col gap-4 pb-2" onSubmit={(e) => { e.preventDefault(); void patch({ name: name.trim() }); }}>
          <label className="flex flex-col gap-1.5">
            <span className={label}>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </label>
          <button type="submit" disabled={busy || !name.trim() || name.trim() === project.name} className={primary}>Save</button>
          <button type="button" disabled={busy} className="min-h-11 text-[15px] text-link" onClick={() => patch({ status: project.status === "active" ? "archived" : "active" })}>
            {project.status === "active" ? "Archive project" : "Restore project"}
          </button>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </form>
      </DrawerContent>
    </Drawer>
  );
}

type MeetingType = { id: string; key: string; name: string; watchFor: string[]; archived: boolean };

/** Edit meeting types: name and what the assistant watches for. Archived types stay on past meetings. */
export function MeetingTypesSheet({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const [types, setTypes] = useState<MeetingType[] | null>(null);
  const [editing, setEditing] = useState<MeetingType | "new" | null>(null);
  const [name, setName] = useState("");
  const [watch, setWatch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/meeting-types?all=1", { cache: "no-store" });
    if (res.ok) setTypes(((await res.json()) as { types: MeetingType[] }).types);
  }, []);

  useEffect(() => { if (open) { setEditing(null); setError(null); void load(); } }, [open, load]);

  function edit(t: MeetingType | "new") {
    setEditing(t);
    setName(t === "new" ? "" : t.name);
    setWatch(t === "new" ? "" : t.watchFor.join("\n"));
    setError(null);
  }

  async function save(extra: Record<string, unknown> = {}) {
    if (!editing) return;
    setBusy(true);
    const body = { name: name.trim(), watchFor: watch.split("\n").map((s) => s.trim()).filter(Boolean), ...extra };
    const res = editing === "new" ? await sendJson("/api/meeting-types", "POST", body) : await sendJson(`/api/meeting-types/${editing.id}`, "PATCH", body);
    setBusy(false);
    if (!res.ok) return setError("Couldn't save the meeting type.");
    setEditing(null);
    await load();
    onChanged();
  }

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent title={editing ? (editing === "new" ? "New meeting type" : "Edit meeting type") : "Meeting types"}>
        {!editing ? (
          <div className="flex flex-col gap-3 pb-2">
            <ul className="overflow-hidden rounded-xl bg-surface">
              {types?.map((t) => (
                <li key={t.id} className="border-b border-background last:border-b-0">
                  <button type="button" onClick={() => edit(t)} className="flex min-h-12 w-full items-center gap-3 px-4 text-left">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={cn("text-[15px]", t.archived && "text-muted-foreground")}>{t.name}{t.archived ? " (archived)" : ""}</span>
                      {t.watchFor.length > 0 && <span className="truncate text-[12px] text-muted-foreground">Watches for {t.watchFor.join(", ")}</span>}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => edit("new")} className="flex min-h-11 items-center gap-1.5 self-start text-[15px] text-link">
              <Plus className="size-4" aria-hidden="true" /> New meeting type
            </button>
          </div>
        ) : (
          <form className="flex flex-col gap-4 pb-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <label className="flex flex-col gap-1.5">
              <span className={label}>Name</span>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={field} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={label}>What the assistant watches for, one per line (for example: budget, decision makers, next steps)</span>
              <textarea rows={5} value={watch} onChange={(e) => setWatch(e.target.value)} className="rounded-xl border bg-background px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring" />
            </label>
            <button type="submit" disabled={busy || !name.trim()} className={primary}>Save</button>
            {editing !== "new" && (
              <button type="button" disabled={busy} className="min-h-11 text-[15px] text-link" onClick={() => save({ archived: !editing.archived })}>
                {editing.archived ? "Restore" : "Archive"}
              </button>
            )}
            <button type="button" className="min-h-11 text-[15px] text-muted-foreground" onClick={() => setEditing(null)}>Back</button>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          </form>
        )}
      </DrawerContent>
    </Drawer>
  );
}
