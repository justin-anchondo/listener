"use client";

import { ListChecks, MonitorPlay, NotebookText } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ClientAvatar } from "@/components/app/client-avatar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { type Client, loadDirectory } from "@/lib/client/directory";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/live", label: "Live", icon: MonitorPlay, match: (p: string) => p === "/live" || p === "/" },
  { href: "/meetings", label: "Meetings", icon: NotebookText, match: (p: string) => /^\/(meetings|p|m|manage)(\/|$)/.test(p) },
  { href: "/items", label: "Open items", icon: ListChecks, match: (p: string) => p.startsWith("/items") },
];

/** Desktop navigation (large screens only): sections, then clients by name (the picker view, names only). */
export function Sidebar() {
  const path = usePathname();
  const [clients, setClients] = useState<Client[] | null>(null);

  useEffect(() => {
    loadDirectory().then(setClients).catch(() => setClients([]));
  }, []);

  return (
    <nav aria-label="Main" className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-surface/60 px-3 py-5 lg:flex">
      <Link href="/live" className="mb-6 px-3 text-[19px] font-bold tracking-tight">Listener</Link>
      <ul className="flex flex-col gap-0.5">
        {NAV.map(({ href, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn("flex min-h-10 items-center gap-3 rounded-lg px-3 text-[15px]", active ? "bg-background font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/70")}
              >
                <Icon className="size-[18px]" aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
      <h2 className="mt-8 mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Clients</h2>
      <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {clients?.map((c) => {
          const active = path.startsWith(`/c/${c.id}`) || path.startsWith(`/p/${c.id}`) || path.startsWith(`/m/${c.id}`);
          return (
            <li key={c.id}>
              <Link
                href={`/c/${c.id}`}
                aria-current={active ? "page" : undefined}
                className={cn("flex min-h-9 items-center gap-2.5 rounded-lg px-3 text-[14px]", active ? "bg-background font-semibold shadow-sm" : "text-muted-foreground hover:bg-background/70")}
              >
                <ClientAvatar client={c} size={22} className="rounded-full" />
                <span className="truncate">{c.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between border-t px-3 pt-3">
        <span className="text-[12px] text-muted-foreground">Audio is never stored</span>
        <ThemeToggle />
      </div>
    </nav>
  );
}
