import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { ClientAvatar } from "@/components/app/client-avatar";
import { fmtDateTime, minutesBetween } from "@/lib/format";

export type MeetingRowData = {
  id: string;
  clientId: string;
  clientName: string;
  logoVersion: number | null;
  projectName: string;
  startedAt: string;
  endedAt: string | null;
  title: string | null;
  participants: string[];
  openItems: number;
};

/** One meeting in a list: title, participants, client and project, when. */
export function MeetingRow({ m, showClient = true }: { m: MeetingRowData; showClient?: boolean }) {
  const minutes = minutesBetween(m.startedAt, m.endedAt);
  return (
    <li className="border-b border-muted last:border-b-0">
      <Link href={`/m/${m.clientId}/${m.id}`} className="flex min-h-16 items-center gap-3 py-3">
        {showClient && <ClientAvatar client={{ id: m.clientId, name: m.clientName, logoVersion: m.logoVersion }} size={36} />}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[15px] font-semibold">{m.title ?? "No summary yet"}</span>
          {m.participants.length > 0 && (
            <span className="truncate text-[13px]">with {m.participants.join(", ")}</span>
          )}
          <span className="truncate text-[13px] text-muted-foreground">
            {showClient ? `${m.clientName} · ` : ""}{m.projectName}
          </span>
          <span className="truncate text-[13px] text-muted-foreground">
            {fmtDateTime(m.startedAt)}{minutes ? ` · ${minutes} min` : ""}
          </span>
        </span>
        {m.openItems > 0 && (
          <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">{m.openItems} open</span>
        )}
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}
