"use client";

import { useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { type DueTone, dueChip, localIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const TONE: Record<DueTone, string> = {
  overdue: "bg-destructive-soft text-destructive",
  soon: "bg-warning-soft text-warning",
  later: "bg-muted text-muted-foreground",
  none: "bg-accent text-accent-foreground",
  done: "bg-muted text-muted-foreground",
};

/** Due date chip. Tapping it opens the phone's own date picker. */
export function DueChip({
  dueDate,
  done,
  onChange,
  label: ariaFor,
}: {
  dueDate: string | null;
  done?: boolean;
  onChange: (date: string | null) => void;
  label: string;
}) {
  const today = localIsoDate();
  const { label, tone } = dueChip(dueDate, today, done);
  return (
    <span className={cn("relative inline-flex min-h-8 shrink-0 items-center rounded-full px-2.5 text-xs font-semibold", TONE[tone])}>
      {label}
      <input
        type="date"
        aria-label={`Due date for ${ariaFor}`}
        value={dueDate ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </span>
  );
}

export type RowItem = {
  id: string;
  title: string;
  sub: string;
  dueDate: string | null;
  done: boolean;
};

export function ItemRow({
  item,
  onToggle,
  onDue,
  onOpen,
}: {
  item: RowItem;
  onToggle: () => void;
  onDue: (date: string | null) => void;
  onOpen: () => void;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-muted py-2.5 last:border-b-0">
      <Checkbox checked={item.done} onCheckedChange={onToggle} aria-label={`Mark "${item.title}" ${item.done ? "open" : "done"}`} />
      <button type="button" onClick={onOpen} className="flex min-h-11 min-w-0 flex-1 flex-col items-start justify-center gap-0.5 text-left">
        <span className={cn("text-[15px] leading-snug", item.done && "text-muted-foreground line-through")}>{item.title}</span>
        <span className="truncate text-[13px] text-muted-foreground">{item.sub}</span>
      </button>
      <DueChip dueDate={item.dueDate} done={item.done} onChange={onDue} label={item.title} />
    </li>
  );
}

export type SheetItem = {
  id: string;
  title: string;
  owner: string | null;
  dueDate: string | null;
  snoozedUntil?: string | null;
  context?: string;
  meetingHref?: string | null;
  sourceQuote?: string | null;
};

export type ItemPatch = { title?: string; owner?: string | null; dueDate?: string | null; snoozedUntil?: string | null };

/** Bottom sheet for one action item (21st.dev Drawer). */
export function ItemSheet({
  item,
  onClose,
  onSave,
  onDelete,
  allowSnooze,
}: {
  item: SheetItem | null;
  onClose: () => void;
  onSave: (patch: ItemPatch) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  allowSnooze?: boolean;
}) {
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("");
  const [due, setDue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!item) return;
    setTitle(item.title);
    setOwner(item.owner ?? "");
    setDue(item.dueDate ?? "");
    setConfirmDelete(false);
  }, [item]);

  const dirty = !!item && (title.trim() !== item.title || (owner.trim() || null) !== item.owner || (due || null) !== item.dueDate);

  return (
    <Drawer open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent title="Action item" description={item?.context}>
        {item && (
          <div className="flex flex-col gap-4 pb-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] text-muted-foreground">What</span>
              <textarea
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                rows={2}
                className="rounded-xl border bg-background px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="text-[13px] text-muted-foreground">Owner</span>
                <input
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  placeholder="Me"
                  className="min-h-11 w-full min-w-0 rounded-xl border bg-background px-3 text-base outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="text-[13px] text-muted-foreground">Due</span>
                <input
                  type="date"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                  className="min-h-11 w-full min-w-0 rounded-xl border bg-background px-3 text-base outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
            </div>
            {item.sourceQuote && <q className="text-[13px] text-muted-foreground">{item.sourceQuote}</q>}

            <button
              type="button"
              disabled={!dirty || !title.trim()}
              onClick={async () => {
                await onSave({
                  ...(title.trim() !== item.title ? { title: title.trim() } : {}),
                  ...((owner.trim() || null) !== item.owner ? { owner: owner.trim() || null } : {}),
                  ...((due || null) !== item.dueDate ? { dueDate: due || null } : {}),
                });
                onClose();
              }}
              className="min-h-12 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-40"
            >
              Save
            </button>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[15px]">
              {allowSnooze &&
                (item.snoozedUntil && item.snoozedUntil > localIsoDate() ? (
                  <button type="button" className="min-h-11 text-link" onClick={async () => { await onSave({ snoozedUntil: null }); onClose(); }}>
                    Unsnooze
                  </button>
                ) : (
                  <button type="button" className="min-h-11 text-link" onClick={async () => { await onSave({ snoozedUntil: localIsoDate(7) }); onClose(); }}>
                    Snooze a week
                  </button>
                ))}
              {item.meetingHref && (
                <a href={item.meetingHref} className="flex min-h-11 items-center text-link">
                  Open meeting
                </a>
              )}
              {onDelete && (
                <button
                  type="button"
                  className="ml-auto min-h-11 text-destructive"
                  onClick={async () => {
                    if (!confirmDelete) return setConfirmDelete(true);
                    await onDelete();
                    onClose();
                  }}
                >
                  {confirmDelete ? "Tap again to delete" : "Delete"}
                </button>
              )}
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
