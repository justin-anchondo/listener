"use client";

import { CircleDot, ListChecks, NotebookText } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Record", icon: CircleDot, match: (p: string) => p === "/" },
  { href: "/meetings", label: "Meetings", icon: NotebookText, match: (p: string) => /^\/(meetings|p|m|manage)(\/|$)/.test(p) },
  { href: "/items", label: "Open items", icon: ListChecks, match: (p: string) => p.startsWith("/items") },
];

export function TabBar({ openCount }: { openCount?: number }) {
  const path = usePathname();
  return (
    <nav
      data-tabbar=""
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-safe"
    >
      <div className="mx-auto grid max-w-xl grid-cols-3">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-12 flex-col items-center justify-center gap-1 pt-2 text-[11px] font-medium",
                active ? "text-link" : "text-muted-foreground",
              )}
            >
              <Icon className="size-6" strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
              {label}
              {href === "/items" && openCount ? (
                <span className="absolute top-1 left-1/2 ml-2 rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground">
                  {openCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
