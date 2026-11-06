"use client";

import { Pencil } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { BriefPanel } from "@/components/app/brief";
import { ProjectEditSheet } from "@/components/app/edit-sheets";
import { MeetingRow, type MeetingRowData } from "@/components/app/meeting-row";
import { PageHeader } from "@/components/app/page-header";
import { type Client, type Project, loadDirectory } from "@/lib/client/directory";

export default function ProjectMeetings({ clientId, projectId }: { clientId: string; projectId: string }) {
  const [meetings, setMeetings] = useState<MeetingRowData[] | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const dir = await loadDirectory().catch(() => []);
    const c = dir.find((x) => x.id === clientId) ?? null;
    setClient(c);
    setProject(c?.projects.find((x) => x.id === projectId) ?? null);
    const res = await fetch(`/api/meetings/recent?client=${clientId}&project=${projectId}`, { cache: "no-store" });
    if (res.status === 401) return window.location.assign("/");
    if (!res.ok) return setError("Couldn't load meetings.");
    setMeetings(((await res.json()) as { meetings: MeetingRowData[] }).meetings);
  }, [clientId, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        back={{ href: `/c/${clientId}`, label: client?.name ?? "Client" }}
        title={project ? `${project.name}${project.status === "archived" ? " (archived)" : ""}` : " "}
        actions={project && (
          <button type="button" onClick={() => setEditing(true)} aria-label="Edit project details" className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-muted">
            <Pencil className="size-[18px]" aria-hidden="true" />
          </button>
        )}
      />
      <main className="flex flex-col px-5 pt-4 pb-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start lg:gap-10">
        <div className="lg:sticky lg:top-6"><BriefPanel clientId={clientId} projectId={projectId} /></div>
        <section className="flex flex-col">
          <h2 className="mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:mt-0">Meetings</h2>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          {!meetings && !error && <p className="pt-2 text-sm text-muted-foreground">Loading…</p>}
          {meetings?.length === 0 && <p className="pt-2 text-[15px] text-muted-foreground">No meetings recorded for this project yet.</p>}
          <ul>{meetings?.map((m) => <MeetingRow key={m.id} m={m} showClient={false} />)}</ul>
        </section>
      </main>
      {project && (
        <ProjectEditSheet clientId={clientId} project={project} open={editing} onClose={() => setEditing(false)} onChanged={() => void load()} />
      )}
    </>
  );
}
