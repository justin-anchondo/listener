"use client";

import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ClientAvatar } from "@/components/app/client-avatar";
import { MeetingRow, type MeetingRowData } from "@/components/app/meeting-row";
import { PageHeader } from "@/components/app/page-header";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { type Client, loadDirectory, sendJson } from "@/lib/client/directory";
import { cn } from "@/lib/utils";

type View = "recent" | "clients";
const VIEW_KEY = "listener.meetingsView"; // per device convenience

export default function MeetingsHome() {
  const router = useRouter();
  const [view, setView] = useState<View>("recent");
  const [clients, setClients] = useState<Client[] | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<MeetingRowData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    loadDirectory().then(setClients).catch(() => setError("Couldn't load clients."));
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "recent" || v === "clients") setView(v);
    } catch {
      // storage unavailable
    }
  }, []);

  useEffect(() => {
    setMeetings(null);
    fetch(`/api/meetings/recent${filter ? `?client=${filter}` : ""}`, { cache: "no-store" })
      .then((r) => (r.status === 401 ? (window.location.assign("/"), null) : r.ok ? r.json() : Promise.reject()))
      .then((b: { meetings: MeetingRowData[] } | null) => b && setMeetings(b.meetings))
      .catch(() => setError("Couldn't load meetings."));
  }, [filter]);

  function changeView(v: View) {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // storage unavailable
    }
  }

  async function createClient() {
    const res = await sendJson("/api/clients", "POST", { name: name.trim() });
    if (!res.ok) return setError("Couldn't create the client.");
    const { id } = (await res.json()) as { id: string };
    router.push(`/c/${id}`);
  }

  return (
    <>
      <PageHeader title="Meetings" />
      <div className="flex flex-col gap-3 px-5 pt-3">
        <SegmentedControl<View>
          options={[{ value: "recent", label: "Recent" }, { value: "clients", label: "By client" }]}
          value={view}
          onChange={changeView}
          fullWidth
          aria-label="Meetings view"
        />
        {view === "recent" && clients && clients.length > 1 && (
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]" role="group" aria-label="Filter by client">
            <button
              type="button"
              aria-pressed={!filter}
              onClick={() => setFilter(null)}
              className={cn("min-h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-medium", !filter ? "border-foreground bg-foreground text-background" : "text-muted-foreground")}
            >
              All
            </button>
            {clients.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={filter === c.id}
                onClick={() => setFilter(filter === c.id ? null : c.id)}
                className={cn(
                  "flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-3 text-[13px] font-medium",
                  filter === c.id ? "border-foreground bg-foreground text-background" : "text-muted-foreground",
                )}
              >
                <ClientAvatar client={c} size={26} className="rounded-full" />
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <main className="flex flex-col px-5 pt-3 pb-6">
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

        {view === "recent" && (
          <>
            {!meetings && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
            {meetings?.length === 0 && <p className="text-[15px] text-muted-foreground">No meetings yet. Record one from the Record tab.</p>}
            {filter && (
              <Link href={`/c/${filter}`} className="mb-1 flex min-h-10 items-center gap-1 self-start text-[14px] text-link">
                Client page <ChevronRight className="size-4" aria-hidden="true" />
              </Link>
            )}
            <ul>{meetings?.map((m) => <MeetingRow key={m.id} m={m} />)}</ul>
          </>
        )}

        {view === "clients" && (
          <>
            {!clients && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
            <ul>
              {clients?.map((c) => {
                const active = c.projects.filter((p) => p.status === "active").length;
                return (
                  <li key={c.id} className="border-b border-muted last:border-b-0">
                    <Link href={`/c/${c.id}`} className="flex min-h-16 items-center gap-3 py-3">
                      <ClientAvatar client={c} size={40} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[16px] font-semibold">{c.name}</span>
                        <span className="text-[13px] text-muted-foreground">{active} project{active === 1 ? "" : "s"}</span>
                      </span>
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
            <button type="button" onClick={() => { setName(""); setAdding(true); }} className="mt-2 flex min-h-11 items-center gap-1.5 self-start text-[15px] font-medium text-link">
              <Plus className="size-4" aria-hidden="true" /> New client
            </button>
          </>
        )}
      </main>

      <Drawer open={adding} onOpenChange={(o) => !o && setAdding(false)}>
        <DrawerContent title="New client">
          <form className="flex flex-col gap-4 pb-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void createClient(); }}>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Client name" placeholder="Client name" className="min-h-11 rounded-xl border bg-background px-3 text-base outline-none focus:ring-2 focus:ring-ring" />
            <button type="submit" disabled={!name.trim()} className="min-h-12 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-40">Create</button>
          </form>
        </DrawerContent>
      </Drawer>
    </>
  );
}
