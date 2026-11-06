"use client";

import { ChevronRight, MessageCircleQuestion, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ClientAvatar } from "@/components/app/client-avatar";
import { ClientEditSheet } from "@/components/app/edit-sheets";
import { MeetingRow, type MeetingRowData } from "@/components/app/meeting-row";
import { PageHeader } from "@/components/app/page-header";
import { RecallSheet } from "@/components/app/recall-sheet";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { type Client, loadDirectory, sendJson } from "@/lib/client/directory";
import { cn } from "@/lib/utils";

export default function ClientPage({ clientId, logoPixels }: { clientId: string; logoPixels: number }) {
  const router = useRouter();
  const [client, setClient] = useState<Client | null | undefined>(undefined);
  const [meetings, setMeetings] = useState<MeetingRowData[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await loadDirectory();
      setClient(list.find((c) => c.id === clientId) ?? null);
    } catch {
      setError("Couldn't load this client.");
    }
    const res = await fetch(`/api/meetings/recent?client=${clientId}`, { cache: "no-store" });
    if (res.ok) setMeetings(((await res.json()) as { meetings: MeetingRowData[] }).meetings);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (client === null) return <main className="px-5 pt-safe"><p className="pt-10 text-muted-foreground">Client not found.</p></main>;
  const projects = client?.projects.filter((p) => showArchived || p.status === "active") ?? [];
  const archivedCount = client?.projects.filter((p) => p.status === "archived").length ?? 0;

  return (
    <>
      <PageHeader
        back={{ href: "/meetings", label: "Meetings" }}
        actions={client && (
          <>
            <button type="button" onClick={() => setAsking(true)} aria-label={`Ask about ${client.name}`} className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-muted">
              <MessageCircleQuestion className="size-5" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setEditing(true)} aria-label="Edit client details" className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-muted">
              <Pencil className="size-[18px]" aria-hidden="true" />
            </button>
          </>
        )}
      />
      <div className="flex items-center gap-3 px-5 pt-1">
        {client && <ClientAvatar client={client} size={48} />}
        <h1 className="min-w-0 truncate text-[26px] font-bold tracking-tight">{client?.name ?? " "}</h1>
      </div>

      <main className="flex flex-col gap-6 px-5 pt-5 pb-6 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start lg:gap-10">
        {error && <p className="text-sm text-destructive lg:col-span-2" role="alert">{error}</p>}

        <section className="flex flex-col gap-2 lg:sticky lg:top-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Projects</h2>
          <ul className="overflow-hidden rounded-xl bg-surface">
            {projects.map((p) => (
              <li key={p.id} className="border-b border-background last:border-b-0">
                <Link href={`/p/${clientId}/${p.id}`} className="flex min-h-12 items-center gap-3 px-4">
                  <span className={cn("flex-1 text-[15px]", p.status === "archived" && "text-muted-foreground")}>
                    {p.name}{p.status === "archived" ? " (archived)" : ""}
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
            <li>
              <button type="button" onClick={() => { setName(""); setAdding(true); }} className="flex min-h-12 w-full items-center gap-2 px-4 text-[15px] text-link">
                <Plus className="size-4" aria-hidden="true" /> New project
              </button>
            </li>
          </ul>
          {archivedCount > 0 && (
            <button type="button" onClick={() => setShowArchived((v) => !v)} className="min-h-9 self-start text-[13px] text-muted-foreground">
              {showArchived ? "Hide" : "Show"} {archivedCount} archived
            </button>
          )}
        </section>

        <section className="flex flex-col">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Meetings</h2>
          {!meetings && <p className="pt-2 text-sm text-muted-foreground">Loading…</p>}
          {meetings?.length === 0 && <p className="pt-2 text-[15px] text-muted-foreground">No meetings yet.</p>}
          <ul>{meetings?.map((m) => <MeetingRow key={m.id} m={m} showClient={false} />)}</ul>
        </section>
      </main>

      {client && (
        <ClientEditSheet
          client={client}
          open={editing}
          logoPixels={logoPixels}
          onClose={() => setEditing(false)}
          onChanged={() => void load()}
          onDeleted={() => router.replace("/meetings")}
        />
      )}

      <Drawer open={adding} onOpenChange={(o) => !o && setAdding(false)}>
        <DrawerContent title={`New project${client ? ` for ${client.name}` : ""}`}>
          <form
            className="flex flex-col gap-4 pb-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!name.trim()) return;
              const res = await sendJson(`/api/clients/${clientId}/projects`, "POST", { name: name.trim() });
              if (!res.ok) return setError("Couldn't create the project.");
              const { id } = (await res.json()) as { id: string };
              router.push(`/p/${clientId}/${id}`);
            }}
          >
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Project name" placeholder="Project name" className="min-h-11 rounded-xl border bg-background px-3 text-base outline-none focus:ring-2 focus:ring-ring" />
            <button type="submit" disabled={!name.trim()} className="min-h-12 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-40">Create</button>
          </form>
        </DrawerContent>
      </Drawer>
      {client && <RecallSheet open={asking} onClose={() => setAsking(false)} clientId={client.id} clientName={client.name} linkSources />}
    </>
  );
}
