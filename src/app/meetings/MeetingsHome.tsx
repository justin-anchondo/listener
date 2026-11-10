"use client";

import { SkeletonRows } from "@/components/ui/skeleton";
import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ClientAvatar } from "@/components/app/client-avatar";
import { useDeleteMeeting } from "@/components/app/delete-meeting";
import { MeetingRow, type MeetingRowData } from "@/components/app/meeting-row";
import { PageHeader } from "@/components/app/page-header";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { cachedFetch, peek } from "@/lib/client/cache";
import { type Client, loadDirectory, peekDirectory, sendJson } from "@/lib/client/directory";
import { cn } from "@/lib/utils";

export default function MeetingsHome() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[] | null>(() => peekDirectory() ?? null);
  const [filter, setFilter] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<MeetingRowData[] | null>(() => peek<{ meetings: MeetingRowData[] }>("/api/meetings/recent")?.meetings ?? null);
  const [error, setError] = useState<string | null>(null);
  const deleting = useDeleteMeeting((id) => setMeetings((list) => list && list.filter((m) => m.id !== id)));
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    loadDirectory().then(setClients).catch(() => setError("Couldn't load clients."));
  }, []);

  useEffect(() => {
    const url = `/api/meetings/recent${filter ? `?client=${filter}` : ""}`;
    setMeetings(peek<{ meetings: MeetingRowData[] }>(url)?.meetings ?? null);
    cachedFetch(url)
      .then((r) => (r.status === 401 ? (window.location.assign("/"), null) : r.ok ? r.json() : Promise.reject()))
      .then((b: { meetings: MeetingRowData[] } | null) => b && setMeetings(b.meetings))
      .catch(() => setError("Couldn't load meetings."));
  }, [filter]);

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
        {clients && (
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
            <button
              type="button"
              onClick={() => { setName(""); setAdding(true); }}
              className="flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-dashed px-3 text-[13px] font-medium text-muted-foreground"
            >
              <Plus className="size-3.5" aria-hidden="true" /> New client
            </button>
          </div>
        )}
      </div>

      <main className="flex flex-col px-5 pt-3 pb-6">
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

        {!meetings && !error && <SkeletonRows count={5} />}
        {filter && (
          <Link href={`/c/${filter}`} className="mb-1 flex min-h-10 items-center gap-1 self-start text-[14px] text-link">
            Client page <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        )}
        {meetings?.length === 0 && (
          <p className="text-[15px] text-muted-foreground">{filter ? "No meetings for this client yet." : "No meetings yet. Record one from the Record tab."}</p>
        )}
        <ul>{meetings?.map((m) => <MeetingRow key={m.id} m={m} showClient={!filter} onDelete={deleting.ask} />)}</ul>
      </main>

      <Drawer open={adding} onOpenChange={(o) => !o && setAdding(false)}>
        <DrawerContent title="New client">
          <form className="flex flex-col gap-4 pb-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void createClient(); }}>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Client name" placeholder="Client name" className="min-h-11 rounded-xl border bg-background px-3 text-base outline-none focus:ring-2 focus:ring-ring" />
            <button type="submit" disabled={!name.trim()} className="min-h-12 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-40">Create</button>
          </form>
        </DrawerContent>
      </Drawer>
      {deleting.sheet}
    </>
  );
}
