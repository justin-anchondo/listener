"use client";

import { Trash2 } from "lucide-react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
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

const HOLD_MS = 450; // press and hold to edit
const MOVE_CANCEL_PX = 8; // movement that turns a hold into a scroll or swipe
const SWIPE_DELETE_PX = 110; // swipe left this far, or fling, to delete
const FLING_PX_PER_S = 700;
const UNDO_MS = 6000; // long enough to tap a reason

/** Why a task was deleted; teaches future summaries (fixed values, see policy/feedback). */
export const TASK_REASON_CHIPS = [
  { value: "not_mine", label: "Not mine" },
  { value: "not_a_task", label: "Not a task" },
  { value: "too_vague", label: "Too vague" },
  { value: "duplicate", label: "Duplicate" },
] as const;
export type TaskReason = (typeof TASK_REASON_CHIPS)[number]["value"];

export function ItemRow({
  item,
  onToggle,
  onDue,
  onOpen,
  onDelete,
}: {
  item: RowItem;
  onToggle: () => void;
  onDue: (date: string | null) => void;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const revealOpacity = useTransform(x, [-SWIPE_DELETE_PX, -24, 0], [1, 0.6, 0]);
  const rowRef = useRef<HTMLLIElement>(null);
  const hold = useRef<{ timer: number; x: number; y: number } | null>(null);
  const [pressed, setPressed] = useState(false);

  const cancelHold = useCallback(() => {
    if (hold.current) window.clearTimeout(hold.current.timer);
    hold.current = null;
    setPressed(false);
  }, []);
  useEffect(() => cancelHold, [cancelHold]);

  function startHold(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("input,[role=checkbox]")) return;
    cancelHold();
    setPressed(true);
    hold.current = {
      x: e.clientX,
      y: e.clientY,
      timer: window.setTimeout(() => {
        hold.current = null;
        setPressed(false);
        navigator.vibrate?.(10);
        onOpen();
      }, HOLD_MS),
    };
  }

  function moveHold(e: React.PointerEvent) {
    const h = hold.current;
    if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > MOVE_CANCEL_PX) cancelHold();
  }

  return (
    <li ref={rowRef} className="relative overflow-hidden border-b border-muted last:border-b-0">
      {onDelete && (
        <motion.div
          aria-hidden="true"
          style={{ opacity: revealOpacity }}
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
        onDragStart={cancelHold}
        onDragEnd={(_e, info) => {
          if (!onDelete) return;
          if (info.offset.x < -SWIPE_DELETE_PX || info.velocity.x < -FLING_PX_PER_S) {
            const width = rowRef.current?.offsetWidth ?? 400;
            if (reduced) onDelete();
            else void animate(x, -width, { duration: 0.18, ease: "easeOut" }).then(onDelete);
          }
        }}
        onPointerDown={startHold}
        onPointerMove={moveHold}
        onPointerUp={cancelHold}
        onPointerCancel={cancelHold}
        onPointerLeave={cancelHold}
        onContextMenu={(e) => e.preventDefault()}
        style={{ x, touchAction: "pan-y" }}
        className={cn(
          "relative flex select-none items-center gap-3 bg-background py-2.5 transition-colors [-webkit-touch-callout:none]",
          pressed && "bg-muted",
        )}
      >
        <Checkbox checked={item.done} onCheckedChange={onToggle} aria-label={`Mark "${item.title}" ${item.done ? "open" : "done"}`} />
        <button
          type="button"
          // Touch: hold to edit. Mouse, keyboard, and assistive tech open on click.
          onClick={(e) => {
            if (e.detail === 0 || window.matchMedia("(pointer: fine)").matches) onOpen();
          }}
          aria-label={`Edit "${item.title}"`}
          className="flex min-h-11 min-w-0 flex-1 flex-col items-start justify-center gap-0.5 text-left"
        >
          <span className={cn("text-[15px] leading-snug", item.done && "text-muted-foreground line-through")}>{item.title}</span>
          <span className="truncate text-[13px] text-muted-foreground">{item.sub}</span>
        </button>
        <DueChip dueDate={item.dueDate} done={item.done} onChange={onDue} label={item.title} />
      </motion.div>
    </li>
  );
}

/**
 * Delete with a short undo window: the item disappears at once, the request
 * is sent when the window closes, when another item is deleted, or when the
 * page goes away.
 */
export function useUndoDelete<T extends { id: string; title: string }>(commit: (item: T, reason: TaskReason | null) => Promise<void>) {
  const [pending, setPending] = useState<T | null>(null);
  const ref = useRef<{ item: T; timer: number } | null>(null);
  const commitRef = useRef(commit);
  commitRef.current = commit;

  const flush = useCallback((reason: TaskReason | null = null) => {
    const p = ref.current;
    if (!p) return;
    window.clearTimeout(p.timer);
    ref.current = null;
    setPending(null);
    void commitRef.current(p.item, reason);
  }, []);

  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      flush();
    };
  }, [flush]);

  const remove = useCallback((item: T) => {
    flush();
    ref.current = { item, timer: window.setTimeout(() => flush(), UNDO_MS) };
    setPending(item);
  }, [flush]);

  const undo = useCallback(() => {
    if (ref.current) window.clearTimeout(ref.current.timer);
    ref.current = null;
    setPending(null);
  }, []);

  const toast = pending ? (
    <div role="status" className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+76px)] z-40 mx-auto flex max-w-md flex-col gap-2 rounded-xl bg-foreground px-4 py-3 text-background shadow-lg">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-[14px]">Deleted “{pending.title}”</span>
        <button type="button" onClick={undo} className="min-h-9 shrink-0 px-2 text-[14px] font-semibold text-background underline underline-offset-2">Undo</button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Why? (helps future summaries)">
        <span className="text-[12px] opacity-70">Why?</span>
        {TASK_REASON_CHIPS.map((r) => (
          <button key={r.value} type="button" onClick={() => flush(r.value)} className="min-h-8 rounded-full border border-background/30 px-2.5 text-[12px] hover:bg-background/10">
            {r.label}
          </button>
        ))}
      </div>
    </div>
  ) : null;

  return { hiddenId: pending?.id ?? null, remove, toast };
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
