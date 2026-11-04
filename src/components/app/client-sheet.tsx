"use client";

import { Check, ChevronRight, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ClientAvatar } from "@/components/app/client-avatar";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { type Client, loadDirectory, sendJson } from "@/lib/client/directory";
import { cn } from "@/lib/utils";

export type Selection = {
  clientId: string;
  clientName: string;
  logoVersion: number | null;
  projectId: string;
  projectName: string;
  template: string;
};

export type TypeOption = { key: string; name: string };

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

function pick(list: Client[], want: Partial<Selection>, types: TypeOption[]): Selection | null {
  const client = list.find((c) => c.id === want.clientId) ?? list.find((c) => c.projects.some((p) => p.status === "active"));
  const active = client?.projects.filter((p) => p.status === "active") ?? [];
  const project = active.find((p) => p.id === want.projectId) ?? active[0];
  if (!client || !project) return null;
  const template = want.template && types.some((t) => t.key === want.template) ? want.template : types[0]?.key ?? "general";
  return { clientId: client.id, clientName: client.name, logoVersion: client.logoVersion, projectId: project.id, projectName: project.name, template };
}

/** Loads clients and meeting types, restores the last selection, and keeps both fresh. */
export function useClientSelection(initialTypes: TypeOption[]) {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [types, setTypes] = useState<TypeOption[]>(initialTypes);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (prefer?: Partial<Selection>) => {
    try {
      const [list, typeRes] = await Promise.all([loadDirectory(), fetch("/api/meeting-types", { cache: "no-store" })]);
      const t = typeRes.ok ? ((await typeRes.json()) as { types: TypeOption[] }).types.map(({ key, name }) => ({ key, name })) : initialTypes;
      setClients(list);
      setTypes(t);
      setError(null);
      setSelection((current) => {
        const next = pick(list, { ...readLast(), ...current, ...prefer }, t);
        if (next) writeLast(next);
        return next;
      });
    } catch {
      setError("Couldn't load clients.");
    }
  }, [initialTypes]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function choose(s: Selection) {
    setSelection(s);
    writeLast(s);
  }

  return { clients, types, selection, error, refresh, choose };
}

export function ClientSheet({
  open,
  onClose,
  clients,
  selection,
  types,
  onChoose,
  onRefresh,
  onEditTypes,
}: {
  open: boolean;
  onClose: () => void;
  clients: Client[];
  selection: Selection | null;
  types: TypeOption[];
  onChoose: (s: Selection) => void;
  onRefresh: (prefer?: Partial<Selection>) => Promise<void>;
  onEditTypes: () => void;
}) {
  const [clientId, setClientId] = useState(selection?.clientId ?? "");
  const [adding, setAdding] = useState<"client" | "project" | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [template, setTemplate] = useState(selection?.template ?? types[0]?.key);

  // Reset only when the sheet opens; the client list refreshing mid-flow (after "New client") must not undo the step.
  useEffect(() => {
    if (!open) return;
    setClientId(selection?.clientId ?? clients[0]?.id ?? "");
    setTemplate(selection?.template ?? types[0]?.key);
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

  const heading = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent title="Recording for">
        <div className="flex flex-col gap-5 pb-2">
          <section className="flex flex-col gap-2">
            <div className="flex min-h-8 items-center justify-between">
              <h3 className={heading}>Client</h3>
              {client && (
                <Link href={`/c/${client.id}`} aria-label={`Open ${client.name}`} className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                  <Pencil className="size-4" aria-hidden="true" />
                </Link>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {clients.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={c.id === clientId}
                  onClick={() => { setClientId(c.id); setAdding(null); }}
                  className={cn(
                    "flex min-h-10 items-center gap-2 rounded-full border py-1 pl-1 pr-4 text-[15px]",
                    c.id === clientId ? "border-foreground bg-foreground text-background" : "",
                  )}
                >
                  <ClientAvatar client={c} size={30} className="rounded-full" />
                  {c.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setAdding("client"); setName(""); }}
                className={cn("flex min-h-10 items-center gap-1 rounded-full border border-dashed px-3.5 text-[15px]", adding === "client" ? "border-link text-link" : "text-muted-foreground")}
              >
                <Plus className="size-4" aria-hidden="true" /> New client
              </button>
            </div>
          </section>

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
              <h3 className={heading}>Project</h3>
              <ul className="overflow-hidden rounded-xl bg-surface">
                {projects.map((p) => {
                  const current = selection?.projectId === p.id;
                  return (
                    <li key={p.id} className="border-b border-background last:border-b-0">
                      <button
                        type="button"
                        onClick={() => {
                          onChoose({ clientId: client.id, clientName: client.name, logoVersion: client.logoVersion, projectId: p.id, projectName: p.name, template: template ?? types[0]?.key });
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

          {types.length > 0 && (
            <section className="flex flex-col gap-2">
              <div className="flex min-h-8 items-center justify-between">
                <h3 className={heading}>Meeting type</h3>
                <button type="button" onClick={onEditTypes} aria-label="Edit meeting types" className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                  <Pencil className="size-4" aria-hidden="true" />
                </button>
              </div>
              <SegmentedControl
                size="sm"
                fullWidth
                aria-label="Meeting type"
                value={template}
                onChange={(t) => {
                  setTemplate(t);
                  if (selection) onChoose({ ...selection, template: t });
                }}
                options={types.map((t) => ({ value: t.key, label: t.name }))}
              />
            </section>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
