"use client";

import { useEffect, useState } from "react";

type Project = { id: string; name: string; status: "active" | "archived" };
type Client = { id: string; name: string; projects: Project[] };

export type Selection = {
  clientId: string;
  clientName: string;
  projectId: string;
  projectName: string;
  template: string;
};

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

export async function loadDirectory(): Promise<Client[]> {
  const res = await fetch("/api/directory", { cache: "no-store" });
  if (res.status === 401) {
    window.location.reload();
    return [];
  }
  if (!res.ok) throw new Error(`directory ${res.status}`);
  return ((await res.json()) as { clients: Client[] }).clients;
}

export default function MeetingPicker({
  templates,
  value,
  onChange,
}: {
  templates: string[];
  value: Selection | null;
  onChange: (s: Selection | null) => void;
}) {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [template, setTemplate] = useState<string>(templates[0] ?? "general");

  async function refresh(prefer?: { clientId?: string; projectId?: string }) {
    try {
      const list = await loadDirectory();
      setClients(list);
      setError(null);
      const last = { ...readLast(), ...prefer };
      const c = list.find((x) => x.id === (prefer?.clientId ?? value?.clientId ?? last.clientId)) ?? list[0];
      const active = c?.projects.filter((p) => p.status === "active") ?? [];
      const p = active.find((x) => x.id === (prefer?.projectId ?? value?.projectId ?? last.projectId)) ?? active[0];
      setClientId(c?.id ?? "");
      setProjectId(p?.id ?? "");
      if (last.template && templates.includes(last.template)) setTemplate(last.template);
    } catch {
      setError("Couldn't load clients. Check the connection and reload.");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const client = clients?.find((c) => c.id === clientId);
  const projects = client?.projects.filter((p) => p.status === "active") ?? [];
  const project = projects.find((p) => p.id === projectId);

  useEffect(() => {
    if (client && project) {
      const s = { clientId: client.id, clientName: client.name, projectId: project.id, projectName: project.name, template };
      writeLast(s);
      onChange(s);
    } else {
      onChange(null);
    }
  }, [client?.id, client?.name, project?.id, project?.name, template]);

  async function addClient() {
    const name = window.prompt("New client name")?.trim();
    if (!name) return;
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return setError("Couldn't create the client.");
    const { id } = (await res.json()) as { id: string };
    await refresh({ clientId: id, projectId: "" });
    await addProject(id);
  }

  async function addProject(forClient = clientId) {
    if (!forClient) return;
    const name = window.prompt("New project name")?.trim();
    if (!name) return;
    const res = await fetch(`/api/clients/${forClient}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return setError("Couldn't create the project.");
    const { id } = (await res.json()) as { id: string };
    await refresh({ clientId: forClient, projectId: id });
  }

  if (error) return <div className="picker"><p className="error">{error}</p></div>;
  if (!clients) return <div className="picker"><p className="muted">Loading clients…</p></div>;

  return (
    <div className="picker">
      {clients.length === 0 ? (
        <button className="secondary" onClick={addClient}>Add your first client</button>
      ) : (
        <>
          <label>
            <span>Client</span>
            <select
              value={clientId}
              onChange={(e) => {
                const c = clients.find((x) => x.id === e.target.value);
                setClientId(e.target.value);
                setProjectId(c?.projects.find((p) => p.status === "active")?.id ?? "");
              }}
            >
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="small" onClick={addClient} aria-label="Add client">+</button>
          </label>
          <label>
            <span>Project</span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={projects.length === 0}>
              {projects.length === 0 && <option value="">No projects yet</option>}
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button className="small" onClick={() => addProject()} aria-label="Add project">+</button>
          </label>
          <label>
            <span>Type</span>
            <select value={template} onChange={(e) => setTemplate(e.target.value)}>
              {templates.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
            </select>
            <a className="small link" href="/manage">Manage</a>
          </label>
        </>
      )}
    </div>
  );
}
