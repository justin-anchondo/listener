// Browser helpers for the client and project list (names only, SPEC 6.3).

import { cachedFetch, peek } from "@/lib/client/cache";

export type Project = { id: string; name: string; status: "active" | "archived" };
export type Client = { id: string; name: string; logoVersion: number | null; projects: Project[] };

/** The last loaded client list, if any, for an instant first render. */
export function peekDirectory(): Client[] | undefined {
  return peek<{ clients: Client[] }>("/api/directory")?.clients;
}

export async function loadDirectory(): Promise<Client[]> {
  const res = await cachedFetch("/api/directory");
  if (res.status === 401) {
    window.location.assign("/");
    return [];
  }
  if (!res.ok) throw new Error(`directory ${res.status}`);
  return ((await res.json()) as { clients: Client[] }).clients;
}

export async function sendJson(url: string, method: string, body?: unknown): Promise<Response> {
  return fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
