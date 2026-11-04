"use client";

import { useEffect, useState } from "react";
import { daysUntil, fmtDateTime, minutesBetween } from "@/lib/format";
import { loadDirectory } from "../../../MeetingPicker";

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
    <main className="page">
      <header className="bar">
        <a className="link" href="/">‹ Record</a>
        <span className="label grow">{names ? `${names.client} · ${names.project}` : "Meetings"}</span>
        <a className="link" href="/items">Open items</a>
      </header>
      {error && <p className="error pad">{error}</p>}
      {!meetings && !error && <p className="muted pad">Loading…</p>}
      {meetings?.length === 0 && <p className="muted pad">No meetings recorded for this project yet.</p>}
      <ul className="meeting-list">
        {meetings?.map((m) => {
          const minutes = minutesBetween(m.startedAt, m.endedAt);
          const days = m.transcriptExpiresAt ? daysUntil(m.transcriptExpiresAt) : null;
          return (
            <li key={m.id}>
              <a href={`/m/${clientId}/${m.id}`}>
                <strong>{m.title ?? "No summary yet"}</strong>
                <span className="muted">
                  {fmtDateTime(m.startedAt)}{minutes ? ` · ${minutes} min` : ""} · {m.template.replace(/_/g, " ")}
                </span>
                <span className="muted small-text">
                  {m.openItems > 0 ? `${m.openItems} open item${m.openItems === 1 ? "" : "s"} · ` : ""}
                  {days === null ? "transcript deleted" : `transcript kept ${Math.max(0, days)} more days`}
                  {m.tags.length > 0 ? ` · ${m.tags.join(", ").replace(/_/g, " ")}` : ""}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
