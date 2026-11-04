"use client";

import { isMine } from "@/lib/owner";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type ItemPatch, ItemRow, ItemSheet, type SheetItem } from "@/components/app/items";
import { PageHeader } from "@/components/app/page-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { sendJson } from "@/lib/client/directory";
import { type DueGroup, dueGroup, dueSummary, localIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type OpenItem = {
  id: string;
  clientId: string;
  clientName: string;
  projectId: string;
  projectName: string;
  meetingId: string | null;
  title: string;
  owner: string | null;
  dueDate: string | null;
  snoozedUntil: string | null;
};

type View = "all" | "client";

const DATE_GROUPS: { key: DueGroup; label: string; urgent?: boolean }[] = [
  { key: "overdue", label: "Overdue", urgent: true },
  { key: "today", label: "Today" },
  { key: "week", label: "Next 7 days" },
  { key: "later", label: "Later" },
  { key: "none", label: "No date" },
  { key: "snoozed", label: "Snoozed" },
];

const VIEW_KEY = "listener.itemsView"; // per device convenience

export default function OpenItems({ ownerNames }: { ownerNames: string[] }) {
  const [items, setItems] = useState<OpenItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set()); // ticked this visit, kept visible so it can be undone
  const [view, setView] = useState<View>("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [open, setOpen] = useState<OpenItem | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/open-items", { cache: "no-store" });
    if (res.status === 401) return window.location.assign("/");
    if (!res.ok) return setError("Couldn't load open items.");
    setItems(((await res.json()) as { items: OpenItem[] }).items);
  }, []);

  useEffect(() => {
    void load();
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === "all" || saved === "client") setView(saved);
    } catch {
      // storage unavailable
    }
  }, [load]);

  function changeView(v: View) {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // storage unavailable
    }
  }

  async function patch(item: OpenItem, body: ItemPatch & { status?: "open" | "done" }) {
    setItems((list) => list && list.map((i) => (i.id === item.id ? { ...i, ...body } : i)));
    const res = await sendJson(`/api/clients/${item.clientId}/action-items/${item.id}`, "PATCH", body);
    if (!res.ok) {
      setError("Couldn't save that change.");
      await load();
    }
  }

  async function toggle(item: OpenItem) {
    const nowDone = !done.has(item.id);
    setDone((s) => {
      const n = new Set(s);
      if (nowDone) n.add(item.id);
      else n.delete(item.id);
      return n;
    });
    await patch(item, { status: nowDone ? "done" : "open" });
  }

  const today = localIsoDate();
  const shown = useMemo(() => (items ?? []).filter((i) => !mineOnly || isMine(i.owner, ownerNames)), [items, mineOnly, ownerNames]);
  const openOnes = shown.filter((i) => !done.has(i.id));
  const counts = dueSummary(openOnes, today);

  const groups = useMemo(() => {
    const order = (i: OpenItem) => i.dueDate ?? "9999";
    if (view === "all") {
      return DATE_GROUPS.map((g) => ({
        key: g.key,
        title: g.label,
        urgent: g.urgent,
        meta: "",
        items: shown.filter((i) => dueGroup(i.dueDate, i.snoozedUntil, today) === g.key).sort((a, b) => order(a).localeCompare(order(b))),
        sub: (i: OpenItem) => [i.clientName, i.owner].filter(Boolean).join(" · "),
      })).filter((g) => g.items.length);
    }
    const byClient = new Map<string, OpenItem[]>();
    for (const i of shown) byClient.set(i.clientId, [...(byClient.get(i.clientId) ?? []), i]);
    return [...byClient.values()]
      .sort((a, b) => a[0].clientName.localeCompare(b[0].clientName))
      .map((list) => {
        const overdue = list.filter((i) => !done.has(i.id) && dueGroup(i.dueDate, i.snoozedUntil, today) === "overdue").length;
        const openCount = list.filter((i) => !done.has(i.id)).length;
        return {
          key: list[0].clientId,
          title: list[0].clientName,
          urgent: false,
          meta: `${openCount} open${overdue ? ` · ${overdue} overdue` : ""}`,
          items: [...list].sort((a, b) => order(a).localeCompare(order(b))),
          sub: (i: OpenItem) => [i.projectName, i.owner].filter(Boolean).join(" · "),
        };
      });
  }, [shown, view, done, today]);

  const sheetItem: SheetItem | null = open && {
    id: open.id,
    title: open.title,
    owner: open.owner,
    dueDate: open.dueDate,
    snoozedUntil: open.snoozedUntil,
    context: `${open.clientName} · ${open.projectName}`,
    meetingHref: open.meetingId ? `/m/${open.clientId}/${open.meetingId}` : null,
  };

  return (
    <>
      <PageHeader title={<span className="flex items-baseline gap-2">Open items <span className="text-base font-normal text-muted-foreground">{openOnes.length || ""}</span></span>} />

      <div className="flex flex-col gap-3 px-5 pt-2">
        {items && (
          <p className="text-sm text-muted-foreground">
            <span className={cn(counts.overdue ? "font-semibold text-destructive" : "")}>{counts.overdue} overdue</span>
            {" · "}{counts.week} due this week{" · "}{counts.none} without a date
          </p>
        )}
        <SegmentedControl<View>
          options={[{ value: "all", label: "All clients" }, { value: "client", label: "By client" }]}
          value={view}
          onChange={changeView}
          fullWidth
          aria-label="Group open items"
        />
        <div>
          <button
            type="button"
            aria-pressed={mineOnly}
            onClick={() => setMineOnly((v) => !v)}
            className={cn(
              "min-h-9 rounded-full border px-3.5 text-[13px] font-medium",
              mineOnly ? "border-foreground bg-foreground text-background" : "text-muted-foreground",
            )}
          >
            Mine only
          </button>
        </div>
      </div>

      <main className="flex flex-col gap-6 px-5 pt-5">
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        {!items && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
        {items && shown.length === 0 && <p className="text-[15px] text-muted-foreground">Nothing open. Nice.</p>}
        {groups.map((g) => (
          <section key={g.key} aria-label={g.title}>
            <h2 className={cn("flex items-baseline justify-between text-xs font-semibold uppercase tracking-wider", g.urgent ? "text-destructive" : view === "client" ? "text-foreground" : "text-muted-foreground")}>
              <span>{g.title}</span>
              {g.meta && <span className="text-[13px] font-medium normal-case tracking-normal text-muted-foreground">{g.meta}</span>}
            </h2>
            <ul className="mt-1">
              {g.items.map((i) => (
                <ItemRow
                  key={i.id}
                  item={{ id: i.id, title: i.title, sub: g.sub(i), dueDate: i.dueDate, done: done.has(i.id) }}
                  onToggle={() => toggle(i)}
                  onDue={(date) => patch(i, { dueDate: date })}
                  onOpen={() => setOpen(i)}
                />
              ))}
            </ul>
          </section>
        ))}
      </main>

      <ItemSheet
        item={sheetItem}
        allowSnooze
        onClose={() => setOpen(null)}
        onSave={(p) => (open ? patch(open, p) : undefined)}
        onDelete={async () => {
          if (!open) return;
          await sendJson(`/api/clients/${open.clientId}/action-items/${open.id}`, "DELETE");
          await load();
        }}
      />
    </>
  );
}
