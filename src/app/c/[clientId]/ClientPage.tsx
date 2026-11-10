"use client";

import { MessageCircleQuestion, Pencil, Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BriefPanel } from "@/components/app/brief";
import { ClientAvatar } from "@/components/app/client-avatar";
import { useDeleteMeeting } from "@/components/app/delete-meeting";
import { ClientEditSheet, ProjectEditSheet } from "@/components/app/edit-sheets";
import { MeetingRow, type MeetingRowData } from "@/components/app/meeting-row";
import { PageHeader } from "@/components/app/page-header";
import { RecallSheet } from "@/components/app/recall-sheet";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { SkeletonRows } from "@/components/ui/skeleton";
import { cachedFetch, forget, peek } from "@/lib/client/cache";
import { type Client, loadDirectory, peekDirectory, sendJson } from "@/lib/client/directory";
import type { CaptureSettings } from "@/lib/config";
import { cn } from "@/lib/utils";

/**
 * One client in one place: projects as chips, the chosen project's brief, and
 * its meetings, without a separate project screen. ?project= keeps the choice
 * in the address so back and links land in the same place.
 */
export default function ClientPage({ clientId, logoPixels, maxBriefChars, voiceSettings }: { clientId: string; logoPixels: number; maxBriefChars: number; voiceSettings: CaptureSettings }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const projectId = params.get("project");

  const [client, setClient] = useState<Client | null | undefined>(() => peekDirectory()?.find((c) => c.id === clientId));
  const meetingsUrl = `/api/meetings/recent?client=${clientId}${projectId ? `&project=${projectId}` : ""}`;
  const [meetings, setMeetings] = useState<MeetingRowData[] | null>(() => peek<{ meetings: MeetingRowData[] }>(meetingsUrl)?.meetings ?? null);
  const [editing, setEditing] = useState(false);
  const [editingProject, setEditingProject] = useState(false);
  const [asking, setAsking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deleting = useDeleteMeeting((id) => setMeetings((list) => list && list.filter((m) => m.id !== id)));

  const loadClient = useCallback(async () => {
    try {
      const list = await loadDirectory();
      setClient(list.find((c) => c.id === clientId) ?? null);
    } catch {
      setError("Couldn't load this client.");
    }
  }, [clientId]);

  useEffect(() => {
    void loadClient();
  }, [loadClient]);

  useEffect(() => {
    setMeetings(peek<{ meetings: MeetingRowData[] }>(meetingsUrl)?.meetings ?? null);
    let cancelled = false;
    void cachedFetch(meetingsUrl)
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { meetings: MeetingRowData[] } | null) => !cancelled && b && setMeetings(b.meetings))
      .catch(() => !cancelled && setError("Couldn't load meetings."));
    return () => {
      cancelled = true;
    };
  }, [meetingsUrl]);

  const choose = (id: string | null) => router.replace(id ? `${pathname}?project=${id}` : pathname, { scroll: false });

  const projects = useMemo(() => client?.projects.filter((p) => showArchived || p.status === "active" || p.id === projectId) ?? [], [client, showArchived, projectId]);
  const archivedCount = client?.projects.filter((p) => p.status === "archived").length ?? 0;
  const project = client?.projects.find((p) => p.id === projectId) ?? null;

  if (client === null) return <main className="px-5 pt-safe"><p className="pt-10 text-muted-foreground">Client not found.</p></main>;

  const chip = (active: boolean) => cn(
    "flex min-h-9 shrink-0 items-center rounded-full border px-3.5 text-[14px]",
    active ? "border-foreground bg-foreground text-background" : "text-muted-foreground",
  );

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
        {client && <ClientAvatar client={client} size={44} />}
        <h1 className="min-w-0 truncate text-[26px] font-bold tracking-tight">{client?.name ?? " "}</h1>
      </div>

      {/* Projects as a filter: All, each project, then a quiet + for the rare new one. */}
      <div className="-mx-0 flex gap-2 overflow-x-auto px-5 pt-4 pb-1 [scrollbar-width:none]" role="group" aria-label="Projects">
        <button type="button" aria-pressed={!projectId} onClick={() => choose(null)} className={chip(!projectId)}>All</button>
        {projects.map((p) => (
          <button key={p.id} type="button" aria-pressed={p.id === projectId} onClick={() => choose(p.id)} className={cn(chip(p.id === projectId), p.status === "archived" && "italic")}>
            {p.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => { setName(""); setAdding(true); }}
          aria-label="New project"
          title="New project"
          className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground/70 hover:bg-muted hover:text-foreground"
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </div>
      {archivedCount > 0 && (
        <button type="button" onClick={() => setShowArchived((v) => !v)} className="min-h-8 self-start px-5 text-[12px] text-muted-foreground">
          {showArchived ? "Hide" : "Show"} {archivedCount} archived
        </button>
      )}

      <main className={cn("flex flex-col gap-6 px-5 pt-4 pb-6", project && "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start lg:gap-10")}>
        {error && <p className="text-sm text-destructive lg:col-span-2" role="alert">{error}</p>}

        {project && (
          <section className="flex flex-col gap-2 lg:sticky lg:top-6">
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-semibold">{project.name}{project.status === "archived" ? " (archived)" : ""}</h2>
              <button type="button" onClick={() => setEditingProject(true)} aria-label="Edit project details" className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                <Pencil className="size-4" aria-hidden="true" />
              </button>
            </div>
            <BriefPanel clientId={clientId} projectId={project.id} maxChars={maxBriefChars} />
          </section>
        )}

        <section className="flex flex-col">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Meetings</h2>
          {!meetings && !error && <SkeletonRows count={4} avatar={false} />}
          {meetings?.length === 0 && <p className="pt-2 text-[15px] text-muted-foreground">No meetings yet{project ? " for this project" : ""}.</p>}
          <ul>{meetings?.map((m) => <MeetingRow key={m.id} m={m} showClient={false} onDelete={deleting.ask} />)}</ul>
        </section>
      </main>

      {client && (
        <ClientEditSheet
          client={client}
          open={editing}
          logoPixels={logoPixels}
          onClose={() => setEditing(false)}
          onChanged={() => void loadClient()}
          onDeleted={() => router.replace("/meetings")}
        />
      )}
      {project && (
        <ProjectEditSheet
          clientId={clientId}
          project={project}
          open={editingProject}
          onClose={() => setEditingProject(false)}
          onChanged={() => { forget("/api/directory"); void loadClient(); }}
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
              setAdding(false);
              await loadClient();
              choose(id);
            }}
          >
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Project name" placeholder="Project name" className="min-h-11 rounded-xl border bg-background px-3 text-base outline-none focus:ring-2 focus:ring-ring" />
            <button type="submit" disabled={!name.trim()} className="min-h-12 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-40">Create</button>
          </form>
        </DrawerContent>
      </Drawer>
      {client && <RecallSheet open={asking} onClose={() => setAsking(false)} clientId={client.id} clientName={client.name} linkSources voiceSettings={voiceSettings} />}
      {deleting.sheet}
    </>
  );
}
