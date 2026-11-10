"use client";

// Last good response per URL, kept in memory for this tab only (never written
// to storage), so a screen you've already visited shows at once while it
// refreshes in the background.

const store = new Map<string, unknown>();

export function peek<T>(url: string): T | undefined {
  return store.get(url) as T | undefined;
}

export function forget(prefix: string): void {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}

/** fetch() for JSON reads that also remembers a successful body under the URL. */
export async function cachedFetch(url: string): Promise<Response> {
  const res = await fetch(url, { cache: "no-store" });
  if (res.ok) {
    try {
      store.set(url, await res.clone().json());
    } catch {
      // not JSON; nothing to remember
    }
  }
  return res;
}
