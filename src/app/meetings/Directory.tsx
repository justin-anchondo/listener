"use client";

import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { type Client, type Project, loadDirectory, sendJson } from "@/lib/client/directory";
import { cn } from "@/lib/utils";

type Sheet =
  | { kind: "new-client" }
  | { kind: "new-project"; client: Client }
  | { kind: "rename-client"; client: Client }
  | { kind: "delete-client"; client: Client }
  | { kind: "project"; client: Client; project: Project };

export default function Directory() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    try {
      setClients(await loadDirectory());
    } catch {
      setError("Couldn't load clients.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(res: Promise<Response>, failure: string) {
    const r = await res;
    if (!r.ok) setError(failure);
    else setError(null);
    await load();
    return r.ok;
  }

  return (
    <>
      <PageHeader
        title="Meetings"
        actions={
          clients && clients.length > 0 ? (
            <button type="button" onClick={() => setEditing((v) => !v)} className="min-h-11 px-2 text-[15px] font-medium text-link">
              {editing ? "Done" : "Edit"}
            </button>
          ) : null
        }
      />

      <main className="flex flex-col gap-5 px-5 pt-4">
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        {!clients && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
        {clients?.length === 0 && (
          <p className="text-[15px] text-muted-foreground">No clients yet. Add one to start recording meetings for it.</p>
        )}

        {clients?.map((c) => {
          const projects = c.projects.filter((p) => showArchived || p.status === "active");
          return (
            <section key={c.id} className="flex flex-col">
              <div className="flex min-h-10 items-center justify-between gap-2">
                <h2 className="text-[17px] font-semibold">{c.name}</h2>
                {editing && (
                  <div className="flex gap-4 text-[14px]">
                    <button type="button" className="min-h-10 text-link" onClick={() => setSheet({ kind: "rename-client", client: c })}>Rename</button>
                    <button type="button" className="min-h-10 text-destructive" onClick={() => setSheet({ kind: "delete-client", client: c })}>Delete</button>
                  </div>
                )}
              </div>
              <ul className="overflow-hidden rounded-xl bg-surface">
                {projects.map((p) => (
                  <li key={p.id} className="border-b border-background last:border-b-0">
                    {editing ? (
                      <button
                        type="button"
                        onClick={() => setSheet({ kind: "project", client: c, project: p })}
                        className="flex min-h-12 w-full items-center gap-3 px-4 text-left"
                      >
                        <span className={cn("flex-1 text-[15px]", p.status === "archived" && "text-muted-foreground")}>
                          {p.name}{p.status === "archived" ? " (archived)" : ""}
                        </span>
                        <span className="text-[14px] text-link">Edit</span>
                      </button>
                    ) : (
                      <Link href={`/p/${c.id}/${p.id}`} className="flex min-h-12 items-center gap-3 px-4">
                        <span className={cn("flex-1 text-[15px]", p.status === "archived" && "text-muted-foreground")}>
                          {p.name}{p.status === "archived" ? " (archived)" : ""}
                        </span>
                        <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                      </Link>
                    )}
                  </li>
                ))}
                {projects.length === 0 && <li className="px-4 py-3 text-[14px] text-muted-foreground">No active projects</li>}
              </ul>
              {editing && (
                <button type="button" onClick={() => setSheet({ kind: "new-project", client: c })} className="mt-1 flex min-h-11 items-center gap-1.5 self-start text-[14px] text-link">
                  <Plus className="size-4" aria-hidden="true" /> Project
                </button>
              )}
            </section>
          );
        })}

        {clients && (
          <div className="flex flex-col items-start gap-1 pb-6">
            <button type="button" onClick={() => setSheet({ kind: "new-client" })} className="flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-link">
              <Plus className="size-4" aria-hidden="true" /> New client
            </button>
            {clients.some((c) => c.projects.some((p) => p.status === "archived")) && (
              <button type="button" onClick={() => setShowArchived((v) => !v)} className="min-h-11 text-[14px] text-muted-foreground">
                {showArchived ? "Hide archived projects" : "Show archived projects"}
              </button>
            )}
            <button
              type="button"
              onClick={async () => { await sendJson("/api/auth/logout", "POST"); window.location.assign("/"); }}
              className="mt-4 min-h-11 text-[14px] text-muted-foreground"
            >
              Sign out
            </button>
          </div>
        )}
      </main>

      <DirectorySheets
        sheet={sheet}
        onClose={() => setSheet(null)}
        onCreateClient={async (name) => run(sendJson("/api/clients", "POST", { name }), "Couldn't create the client.")}
        onCreateProject={async (c, name) => run(sendJson(`/api/clients/${c.id}/projects`, "POST", { name }), "Couldn't create the project.")}
        onRenameClient={async (c, name) => run(sendJson(`/api/clients/${c.id}`, "PATCH", { name }), "Couldn't rename the client.")}
        onDeleteClient={async (c) => run(sendJson(`/api/clients/${c.id}`, "DELETE"), "Couldn't delete the client.")}
        onUpdateProject={async (c, p, body) => run(sendJson(`/api/clients/${c.id}/projects/${p.id}`, "PATCH", body), "Couldn't update the project.")}
      />
    </>
  );
}

const field = "min-h-11 w-full rounded-xl border bg-background px-3 text-base outline-none focus:ring-2 focus:ring-ring";
const primary = "min-h-12 w-full rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-40";

function DirectorySheets({
  sheet,
  onClose,
  onCreateClient,
  onCreateProject,
  onRenameClient,
  onDeleteClient,
  onUpdateProject,
}: {
  sheet: Sheet | null;
  onClose: () => void;
  onCreateClient: (name: string) => Promise<boolean>;
  onCreateProject: (c: Client, name: string) => Promise<boolean>;
  onRenameClient: (c: Client, name: string) => Promise<boolean>;
  onDeleteClient: (c: Client) => Promise<boolean>;
  onUpdateProject: (c: Client, p: Project, body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [brief, setBrief] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBusy(false);
    setBrief(null);
    if (!sheet) return;
    if (sheet.kind === "rename-client") setText(sheet.client.name);
    else if (sheet.kind === "project") {
      setText(sheet.project.name);
      void fetch(`/api/clients/${sheet.client.id}/projects/${sheet.project.id}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { brief: "" }))
        .then((b: { brief: string | null }) => setBrief(b.brief ?? ""));
    } else setText("");
  }, [sheet]);

  async function act(fn: () => Promise<boolean>) {
    setBusy(true);
    const ok = await fn();
    setBusy(false);
    if (ok) onClose();
  }

  const title =
    sheet?.kind === "new-client" ? "New client"
    : sheet?.kind === "new-project" ? `New project for ${sheet.client.name}`
    : sheet?.kind === "rename-client" ? "Rename client"
    : sheet?.kind === "delete-client" ? `Delete ${sheet.client.name}?`
    : sheet?.kind === "project" ? "Project"
    : "";

  return (
    <Drawer open={!!sheet} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent title={title}>
        {sheet && (sheet.kind === "new-client" || sheet.kind === "new-project" || sheet.kind === "rename-client") && (
          <form
            className="flex flex-col gap-4 pb-2"
            onSubmit={(e) => {
              e.preventDefault();
              const name = text.trim();
              if (!name) return;
              void act(() =>
                sheet.kind === "new-client" ? onCreateClient(name)
                : sheet.kind === "new-project" ? onCreateProject(sheet.client, name)
                : onRenameClient(sheet.client, name),
              );
            }}
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] text-muted-foreground">Name</span>
              <input autoFocus value={text} onChange={(e) => setText(e.target.value)} className={field} />
            </label>
            <button type="submit" disabled={busy || !text.trim()} className={primary}>
              {sheet.kind === "rename-client" ? "Save" : "Create"}
            </button>
          </form>
        )}

        {sheet?.kind === "delete-client" && (
          <form
            className="flex flex-col gap-4 pb-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim() === sheet.client.name) void act(() => onDeleteClient(sheet.client));
            }}
          >
            <p className="text-[15px]">
              This permanently deletes every project, meeting, summary, action item, and transcript for this client. It can&apos;t be undone.
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] text-muted-foreground">Type <strong className="text-foreground">{sheet.client.name}</strong> to confirm</span>
              <input value={text} onChange={(e) => setText(e.target.value)} className={field} autoComplete="off" />
            </label>
            <button type="submit" disabled={busy || text.trim() !== sheet.client.name} className="min-h-12 w-full rounded-xl bg-destructive text-[15px] font-semibold text-white disabled:opacity-40">
              Delete client
            </button>
          </form>
        )}

        {sheet?.kind === "project" && (
          <div className="flex flex-col gap-4 pb-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] text-muted-foreground">Name</span>
              <input value={text} onChange={(e) => setText(e.target.value)} className={field} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] text-muted-foreground">Brief: goals, stakeholders, sensitivities, open questions. The live assistant uses this.</span>
              <textarea
                rows={7}
                value={brief ?? ""}
                disabled={brief === null}
                placeholder={brief === null ? "Loading…" : ""}
                onChange={(e) => setBrief(e.target.value)}
                className="rounded-xl border bg-background px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <button
              type="button"
              disabled={busy || !text.trim() || brief === null}
              className={primary}
              onClick={() => void act(() => onUpdateProject(sheet.client, sheet.project, { name: text.trim(), brief }))}
            >
              Save
            </button>
            <button
              type="button"
              disabled={busy}
              className="min-h-11 text-[15px] text-link"
              onClick={() => void act(() => onUpdateProject(sheet.client, sheet.project, { status: sheet.project.status === "active" ? "archived" : "active" }))}
            >
              {sheet.project.status === "active" ? "Archive project" : "Restore project"}
            </button>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
