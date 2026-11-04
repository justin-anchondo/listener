"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { type DueGroup, dueGroup, fmtDay, localIsoDate } from "@/lib/format";

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

const GROUPS: { key: DueGroup; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Due today" },
  { key: "week", label: "Next 7 days" },
  { key: "later", label: "Later" },
  { key: "none", label: "No due date" },
  { key: "snoozed", label: "Snoozed" },
];

export default function OpenItems() {
  const [items, setItems] = useState<OpenItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState("");
  const [mineOnly, setMineOnly] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/open-items", { cache: "no-store" });
    if (res.status === 401) return window.location.assign("/");
    if (!res.ok) return setError("Couldn't load open items.");
    setItems(((await res.json()) as { items: OpenItem[] }).items);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function update(item: OpenItem, body: { status?: "done"; snoozedUntil?: string | null }) {
    setItems((list) =>
      list && (body.status === "done" ? list.filter((i) => i.id !== item.id) : list.map((i) => (i.id === item.id ? { ...i, ...body } : i))),
    );
    const res = await fetch(`/api/clients/${item.clientId}/action-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) setError("Couldn't update the item.");
    await load();
  }

  const today = localIsoDate();
  const clients = useMemo(
    () => [...new Map((items ?? []).map((i) => [i.clientId, i.clientName])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [items],
  );
  const shown = (items ?? []).filter((i) => (!client || i.clientId === client) && (!mineOnly || i.owner === "Me"));

  return (
    <main className="page">
      <header className="bar">
        <a className="link" href="/">‹ Record</a>
        <span className="label grow">Open items</span>
        <span className="muted">{shown.length}</span>
      </header>
      {error && <p className="error pad">{error}</p>}
      {!items && !error && <p className="muted pad">Loading…</p>}
      {items && (
        <div className="filters pad">
          <select value={client} onChange={(e) => setClient(e.target.value)} aria-label="Client">
            <option value="">All clients</option>
            {clients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <label><input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> Mine only</label>
        </div>
      )}
      {items && shown.length === 0 && <p className="muted pad">Nothing open. Nice.</p>}
      {GROUPS.map(({ key, label }) => {
        const group = shown.filter((i) => dueGroup(i.dueDate, i.snoozedUntil, today) === key);
        if (group.length === 0) return null;
        return (
          <section key={key} className={`block group-${key}`}>
            <h3>{label}</h3>
            <ul className="items">
              {group.map((item) => (
                <li key={item.id}>
                  <input type="checkbox" aria-label={`Mark "${item.title}" done`} onChange={() => update(item, { status: "done" })} />
                  <div className="item-body">
                    <span className="item-title">{item.title}</span>
                    <div className="item-meta">
                      <span>{item.clientName} · {item.projectName}</span>
                      {item.owner && <span>{item.owner}</span>}
                      {item.dueDate && <span>{fmtDay(item.dueDate)}</span>}
                      {key === "snoozed" && item.snoozedUntil && <span>until {fmtDay(item.snoozedUntil)}</span>}
                    </div>
                    <div className="item-meta">
                      {key !== "snoozed"
                        ? <button className="link small-text" onClick={() => update(item, { snoozedUntil: localIsoDate(7) })}>Snooze a week</button>
                        : <button className="link small-text" onClick={() => update(item, { snoozedUntil: null })}>Unsnooze</button>}
                      {item.meetingId && <a className="link small-text" href={`/m/${item.clientId}/${item.meetingId}`}>Meeting</a>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
