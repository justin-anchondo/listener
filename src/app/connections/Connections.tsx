"use client";

import { Check, Copy, Plug } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { SkeletonRows } from "@/components/ui/skeleton";
import { sendJson } from "@/lib/client/directory";
import { fmtDateTime } from "@/lib/format";

type Connection = { id: string; toolName: string; createdAt: string; lastUsedAt: string | null; refreshExpiresAt: string };

export default function Connections() {
  const [list, setList] = useState<Connection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");

  async function load() {
    const res = await fetch("/api/connector/connections", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return setError(res?.status === 404 ? "Connecting AI tools is turned off." : "Couldn't load connections.");
    setList(((await res.json()) as { connections: Connection[] }).connections);
  }

  useEffect(() => {
    setUrl(`${window.location.origin}/api/mcp`);
    void load();
  }, []);

  async function revoke(c: Connection) {
    if (!window.confirm(`Disconnect ${c.toolName}? It loses access right away.`)) return;
    const res = await sendJson(`/api/connector/connections/${c.id}`, "DELETE").catch(() => null);
    if (!res?.ok) return setError("Couldn't disconnect.");
    setList((l) => l && l.filter((x) => x.id !== c.id));
  }

  return (
    <>
      <PageHeader title="Connected tools" back={{ href: "/meetings", label: "Meetings" }} />
      <main className="flex max-w-2xl flex-col gap-6 px-5 pb-10">
        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
          <h2 className="flex items-center gap-2 text-[16px] font-semibold"><Plug className="size-4" aria-hidden="true" /> Connect Claude</h2>
          <ol className="list-decimal space-y-1.5 pl-5 text-[14px] text-muted-foreground">
            <li>In Claude, open Settings, then Connectors, then Add custom connector.</li>
            <li>Paste this address and add it.</li>
            <li>Claude opens Listener: approve with Face ID.</li>
          </ol>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 text-[13px]">{url}</code>
            <button
              type="button"
              onClick={() => { void navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
              aria-label="Copy connector address"
              className="grid size-10 shrink-0 place-items-center rounded-lg border hover:bg-muted"
            >
              {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
            </button>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Read only. Claude can read clients, meetings, summaries, and full transcripts still within 30 days. What Claude does with them follows Claude&apos;s own data settings.
          </p>
        </section>

        <section className="flex flex-col">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Connected</h2>
          {error && <p role="alert" className="pt-2 text-[14px] text-destructive">{error}</p>}
          {!list && !error && <SkeletonRows count={2} avatar={false} />}
          {list?.length === 0 && <p className="pt-2 text-[15px] text-muted-foreground">Nothing connected.</p>}
          <ul>
            {list?.map((c) => (
              <li key={c.id} className="flex min-h-16 items-center gap-3 border-b border-muted py-3 last:border-b-0">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[15px] font-semibold">{c.toolName}</span>
                  <span className="text-[13px] text-muted-foreground">
                    Connected {fmtDateTime(c.createdAt)} · {c.lastUsedAt ? `last used ${fmtDateTime(c.lastUsedAt)}` : "not used yet"}
                  </span>
                </span>
                <button type="button" onClick={() => void revoke(c)} className="min-h-9 shrink-0 rounded-lg px-3 text-[14px] font-medium text-destructive hover:bg-destructive-soft">
                  Disconnect
                </button>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
