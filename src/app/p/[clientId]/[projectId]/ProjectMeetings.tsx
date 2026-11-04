"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { loadDirectory } from "@/lib/client/directory";
import { fmtDateTime, minutesBetween } from "@/lib/format";

type Meeting = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  template: string;
  title: string | null;
  tags: string[];
  openItems: number;
  transcriptExpiresAt: string | null;
};

export default function ProjectMeetings({ clientId, projectId }: { clientId: string; projectId: string }) {
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [names, setNames] = useState<{ client: string; project: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/clients/${clientId}/projects/${projectId}/meetings`, { cache: "no-store" });
      if (res.status === 401) return window.location.assign("/");
      if (!res.ok) return setError("Couldn't load meetings.");
      setMeetings(((await res.json()) as { meetings: Meeting[] }).meetings);
      const dir = await loadDirectory().catch(() => []);
      const c = dir.find((x) => x.id === clientId);
      const p = c?.projects.find((x) => x.id === projectId);
      if (c && p) setNames({ client: c.name, project: p.name });
    })();
  }, [clientId, projectId]);

  return (
    <>
      <PageHeader back={{ href: "/meetings", label: names?.client ?? "Meetings" }} title={names?.project ?? " "} />
      <main className="flex flex-col px-5 pt-4">
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        {!meetings && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
        {meetings?.length === 0 && <p className="text-[15px] text-muted-foreground">No meetings recorded for this project yet.</p>}
        <ul>
          {meetings?.map((m) => {
            const minutes = minutesBetween(m.startedAt, m.endedAt);
            return (
              <li key={m.id} className="border-b border-muted last:border-b-0">
                <Link href={`/m/${clientId}/${m.id}`} className="flex min-h-16 items-center gap-3 py-3">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-semibold">{m.title ?? "No summary yet"}</span>
                    <span className="text-[13px] text-muted-foreground">
                      {fmtDateTime(m.startedAt)}{minutes ? ` · ${minutes} min` : ""}
                    </span>
                  </span>
                  {m.openItems > 0 && (
                    <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">{m.openItems} open</span>
                  )}
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
    </>
  );
}
