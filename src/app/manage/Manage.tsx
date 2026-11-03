"use client";

import { useEffect, useState } from "react";
import { loadDirectory } from "../MeetingPicker";

type Project = { id: string; name: string; status: "active" | "archived" };
type Client = { id: string; name: string; projects: Project[] };

async function send(url: string, method: string, body?: unknown): Promise<boolean> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.ok;
}

export default function Manage() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [briefFor, setBriefFor] = useState<{ clientId: string; project: Project; text: string } | null>(null);

  async function refresh() {
    try {
      setClients(await loadDirectory());
      setError(null);
    } catch {
      setError("Couldn't load clients.");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function act(ok: Promise<boolean>, failure: string) {
    if (!(await ok)) setError(failure);
    await refresh();
  }

  function renameClient(c: Client) {
    const name = window.prompt("Client name", c.name)?.trim();
    if (name && name !== c.name) void act(send(`/api/clients/${c.id}`, "PATCH", { name }), "Couldn't rename the client.");
  }

  function deleteClient(c: Client) {
    const typed = window.prompt(
      `Delete ${c.name} and every project, meeting, and transcript under it? This can't be undone. Type the client name to confirm.`,
    );
    if (typed?.trim() === c.name) void act(send(`/api/clients/${c.id}`, "DELETE"), "Couldn't delete the client.");
  }

  function addProject(c: Client) {
    const name = window.prompt(`New project for ${c.name}`)?.trim();
    if (name) void act(send(`/api/clients/${c.id}/projects`, "POST", { name }), "Couldn't create the project.");
  }

  function renameProject(c: Client, p: Project) {
    const name = window.prompt("Project name", p.name)?.trim();
    if (name && name !== p.name) {
      void act(send(`/api/clients/${c.id}/projects/${p.id}`, "PATCH", { name }), "Couldn't rename the project.");
    }
  }

  function toggleArchive(c: Client, p: Project) {
    const status = p.status === "active" ? "archived" : "active";
    void act(send(`/api/clients/${c.id}/projects/${p.id}`, "PATCH", { status }), "Couldn't update the project.");
  }

  async function openBrief(c: Client, p: Project) {
    const res = await fetch(`/api/clients/${c.id}/projects/${p.id}`, { cache: "no-store" });
    if (!res.ok) return setError("Couldn't load the brief.");
    const { brief } = (await res.json()) as { brief: string | null };
    setBriefFor({ clientId: c.id, project: p, text: brief ?? "" });
  }

  async function saveBrief() {
    if (!briefFor) return;
    const ok = await send(`/api/clients/${briefFor.clientId}/projects/${briefFor.project.id}`, "PATCH", { brief: briefFor.text });
    if (!ok) return setError("Couldn't save the brief.");
    setBriefFor(null);
  }

  async function addClient() {
    const name = window.prompt("New client name")?.trim();
    if (name) await act(send("/api/clients", "POST", { name }), "Couldn't create the client.");
  }

  if (briefFor) {
    return (
      <main className="manage">
        <header className="bar">
          <button className="link" onClick={() => setBriefFor(null)}>‹ Back</button>
          <span className="label">{briefFor.project.name} brief</span>
        </header>
        <div className="brief">
          <p className="muted">Goals, stakeholders, sensitivities, open questions. The live assistant will use this in a later phase.</p>
          <textarea value={briefFor.text} onChange={(e) => setBriefFor({ ...briefFor, text: e.target.value })} rows={14} />
          <button onClick={saveBrief}>Save brief</button>
        </div>
      </main>
    );
  }

  return (
    <main className="manage">
      <header className="bar">
        <a className="link" href="/">‹ Record</a>
        <span className="label">Clients</span>
        <button className="link" onClick={addClient}>+ Client</button>
      </header>
      {error && <p className="error pad">{error}</p>}
      {!clients && <p className="muted pad">Loading…</p>}
      {clients?.length === 0 && <p className="muted pad">No clients yet.</p>}
      {clients?.map((c) => (
        <section key={c.id} className="client">
          <div className="row">
            <strong>{c.name}</strong>
            <span className="actions">
              <button className="link" onClick={() => renameClient(c)}>Rename</button>
              <button className="link danger" onClick={() => deleteClient(c)}>Delete</button>
            </span>
          </div>
          {c.projects.map((p) => (
            <div key={p.id} className={`row project ${p.status}`}>
              <span>{p.name}{p.status === "archived" && " (archived)"}</span>
              <span className="actions">
                <button className="link" onClick={() => openBrief(c, p)}>Brief</button>
                <button className="link" onClick={() => renameProject(c, p)}>Rename</button>
                <button className="link" onClick={() => toggleArchive(c, p)}>{p.status === "active" ? "Archive" : "Restore"}</button>
              </span>
            </div>
          ))}
          <button className="link add" onClick={() => addProject(c)}>+ Project</button>
        </section>
      ))}
      <footer className="pad">
        <button className="link" onClick={async () => { await send("/api/auth/logout", "POST"); window.location.href = "/"; }}>
          Sign out
        </button>
      </footer>
    </main>
  );
}
