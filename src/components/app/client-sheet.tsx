"use client";

import { Check, ChevronRight, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { type Client, loadDirectory, sendJson } from "@/lib/client/directory";
import { cn } from "@/lib/utils";

export type Selection = {
  clientId: string;
  clientName: string;
  projectId: string;
  projectName: string;
  template: string;
};

const LAST_KEY = "listener.lastSelection"; // ids only, per device convenience

function readLast(): Partial<Selection> {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? "{}") as Partial<Selection>;
  } catch {
    return {};
  }
}

function writeLast(s: Selection): void {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ clientId: s.clientId, projectId: s.projectId, template: s.template }));
  } catch {
    // storage unavailable; the picker still works
  }
}

function pick(list: Client[], want: Partial<Selection>, templates: string[]): Selection | null {
  const client = list.find((c) => c.id === want.clientId) ?? list.find((c) => c.projects.some((p) => p.status === "active"));
  const active = client?.projects.filter((p) => p.status === "active") ?? [];
  const project = active.find((p) => p.id === want.projectId) ?? active[0];
  if (!client || !project) return null;
  const template = want.template && templates.includes(want.template) ? want.template : templates[0] ?? "general";
  return { clientId: client.id, clientName: client.name, projectId: project.id, projectName: project.name, template };
}

const label = (t: string) => t.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/**
 * Loads the client list, restores the last selection, and lets the owner change
 * it in a bottom sheet (21st.dev Drawer + Segmented Control).
 */
export function useClientSelection(templates: string[]) {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh(prefer?: Partial<Selection>) {
    try {
      const list = await loadDirectory();
      setClients(list);
      setError(null);
      const next = pick(list, { ...readLast(), ...selection, ...prefer }, templates);
      setSelection(next);
      if (next) writeLast(next);
    } catch {
      setError("Couldn't load clients.");
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function choose(s: Selection) {
    setSelection(s);
    writeLast(s);
  }

  return { clients, selection, error, refresh, choose };
}

export function ClientSheet({
  open,
  onClose,
  clients,
  selection,
  templates,
  onChoose,
  onRefresh,
}: {
  open: boolean;
  onClose: () => void;
  clients: Client[];
  selection: Selection | null;
  templates: string[];
  onChoose: (s: Selection) => void;
  onRefresh: (prefer?: Partial<Selection>) => Promise<void>;
}) {
  const [clientId, setClientId] = useState(selection?.clientId ?? "");
  const [adding, setAdding] = useState<"client" | "project" | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [template, setTemplate] = useState(selection?.template ?? templates[0]);

  // Reset only when the sheet opens; the client list refreshing mid-flow (after "New client") must not undo the step.
  useEffect(() => {
    if (!open) return;
    setClientId(selection?.clientId ?? clients[0]?.id ?? "");
    setTemplate(selection?.template ?? templates[0]);
    setAdding(clients.length === 0 ? "client" : null);
    setName("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const client = clients.find((c) => c.id === clientId);
  const projects = client?.projects.filter((p) => p.status === "active") ?? [];

  async function create() {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    if (adding === "client") {
      const res = await sendJson("/api/clients", "POST", { name: n });
      if (res.ok) {
        const { id } = (await res.json()) as { id: string };
        await onRefresh();
        setClientId(id);
        setAdding("project");
        setName("");
      }
    } else if (adding === "project" && client) {
      const res = await sendJson(`/api/clients/${client.id}/projects`, "POST", { name: n });
      if (res.ok) {
        const { id } = (await res.json()) as { id: string };
        await onRefresh({ clientId: client.id, projectId: id, template });
        onClose();
      }
    }
    setBusy(false);
  }

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent title="Recording for">
        <div className="flex flex-col gap-5 pb-2">
          {clients.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client</h3>
              <div className="flex flex-wrap gap-2">
                {clients.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={c.id === clientId}
                    onClick={() => { setClientId(c.id); setAdding(null); }}
                    className={cn("min-h-10 rounded-full border px-4 text-[15px]", c.id === clientId ? "border-foreground bg-foreground text-background" : "")}
                  >
                    {c.name}
                  </button>
                ))}
                <button type="button" onClick={() => { setAdding("client"); setName(""); }} className="flex min-h-10 items-center gap-1 rounded-full border border-dashed px-3.5 text-[15px] text-muted-foreground">
                  <Plus className="size-4" aria-hidden="true" /> New
                </button>
              </div>
            </section>
          )}

          {adding && (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void create(); }}>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={adding === "client" ? "New client name" : `New project for ${client?.name ?? ""}`}
                aria-label={adding === "client" ? "New client name" : "New project name"}
                className="min-h-11 min-w-0 flex-1 rounded-xl border bg-background px-3 text-base outline-none focus:ring-2 focus:ring-ring"
              />
              <button type="submit" disabled={busy || !name.trim()} className="min-h-11 rounded-xl bg-primary px-4 text-[15px] font-semibold text-primary-foreground disabled:opacity-40">
                Add
              </button>
            </form>
          )}

          {client && adding !== "client" && (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Project</h3>
              <ul className="overflow-hidden rounded-xl bg-surface">
                {projects.map((p) => {
                  const current = selection?.projectId === p.id;
                  return (
                    <li key={p.id} className="border-b border-background last:border-b-0">
                      <button
                        type="button"
                        onClick={() => {
                          onChoose({ clientId: client.id, clientName: client.name, projectId: p.id, projectName: p.name, template });
                          onClose();
                        }}
                        className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-[15px]"
                      >
                        <span className="flex-1">{p.name}</span>
                        {current ? <Check className="size-4 text-link" aria-label="Current" /> : <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />}
                      </button>
                    </li>
                  );
                })}
                <li>
                  <button type="button" onClick={() => { setAdding("project"); setName(""); }} className="flex min-h-12 w-full items-center gap-2 px-4 text-[15px] text-link">
                    <Plus className="size-4" aria-hidden="true" /> New project
                  </button>
                </li>
              </ul>
            </section>
          )}

          {templates.length > 1 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Meeting type</h3>
              <SegmentedControl
                size="sm"
                fullWidth
                aria-label="Meeting type"
                value={template}
                onChange={(t) => {
                  setTemplate(t);
                  if (selection) onChoose({ ...selection, template: t });
                }}
                options={templates.map((t) => ({ value: t, label: label(t) }))}
              />
            </section>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export { label as templateLabel };
