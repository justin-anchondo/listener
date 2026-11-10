"use client";

import { ChevronRight, Trash2 } from "lucide-react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import Link from "next/link";
import { useRef } from "react";
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

const SWIPE_DELETE_PX = 110;
const FLING_PX_PER_S = 700;
const DRAG_IS_NOT_A_TAP_PX = 6;

/**
 * One meeting in a list: title, participants, client and project, when.
 * With onDelete, swipe left (or the trash button on hover with a mouse) asks
 * to delete; the caller confirms first.
 */
export function MeetingRow({ m, showClient = true, onDelete }: { m: MeetingRowData; showClient?: boolean; onDelete?: (m: MeetingRowData) => void }) {
  const minutes = minutesBetween(m.startedAt, m.endedAt);
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const reveal = useTransform(x, [-SWIPE_DELETE_PX, -24, 0], [1, 0.6, 0]);
  const dragged = useRef(false);

  return (
    <li className="group relative overflow-hidden border-b border-muted @container last:border-b-0">
      {onDelete && (
        <motion.div
          aria-hidden="true"
          style={{ opacity: reveal }}
          className="absolute inset-0 flex items-center justify-end gap-1.5 bg-destructive pr-5 text-[15px] font-semibold text-white"
        >
          <Trash2 className="size-4" /> Delete
        </motion.div>
      )}
      <motion.div
        drag={onDelete ? "x" : false}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 1, right: 0 }}
        dragMomentum={false}
        onDragStart={() => { dragged.current = false; }}
        onDrag={(_e, info) => { if (Math.abs(info.offset.x) > DRAG_IS_NOT_A_TAP_PX) dragged.current = true; }}
        onDragEnd={(_e, info) => {
          if (!onDelete) return;
          if (info.offset.x < -SWIPE_DELETE_PX || info.velocity.x < -FLING_PX_PER_S) {
            onDelete(m);
          }
          if (!reduced) void animate(x, 0, { type: "spring", stiffness: 500, damping: 40 });
          else x.set(0);
        }}
        style={{ x, touchAction: "pan-y" }}
        className="relative bg-background"
      >
        <Link
          href={`/m/${m.clientId}/${m.id}`}
          onClickCapture={(e) => {
            // A swipe that ends over the row shouldn't also open the meeting.
            if (dragged.current) {
              e.preventDefault();
              dragged.current = false;
            }
          }}
          draggable={false}
          className="flex min-h-16 select-none items-center gap-3 py-3 lg:-mx-3 lg:rounded-lg lg:px-3 lg:hover:bg-surface"
        >
          {showClient && <ClientAvatar client={{ id: m.clientId, name: m.clientName, logoVersion: m.logoVersion }} size={36} />}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[15px] font-semibold">{m.title ?? "No summary yet"}</span>
            {m.participants.length > 0 && (
              <span className="truncate text-[13px]">with {m.participants.join(", ")}</span>
            )}
            <span className="truncate text-[13px] text-muted-foreground @3xl:hidden">
              {showClient ? `${m.clientName} · ` : ""}{m.projectName}
            </span>
            <span className="truncate text-[13px] text-muted-foreground @3xl:hidden">
              {fmtDateTime(m.startedAt)}{minutes ? ` · ${minutes} min` : ""}
            </span>
          </span>
          <span className="hidden w-56 shrink-0 truncate text-[14px] text-muted-foreground @3xl:block">
            {showClient ? `${m.clientName} · ` : ""}{m.projectName}
          </span>
          <span className="hidden w-48 shrink-0 text-[14px] tabular-nums text-muted-foreground @3xl:block">
            {fmtDateTime(m.startedAt)}{minutes ? ` · ${minutes} min` : ""}
          </span>
          {m.openItems > 0 && (
            <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">{m.openItems} open</span>
          )}
          {onDelete && (
            <button
              type="button"
              aria-label={`Delete ${m.title ?? "meeting"}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(m);
              }}
              className="hidden size-9 shrink-0 place-items-center rounded-full text-muted-foreground opacity-0 hover:bg-destructive-soft hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 [@media(pointer:fine)]:grid"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          )}
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      </motion.div>
    </li>
  );
}
