"use client";

import { BellRing, ChevronLeft, ChevronRight, Lightbulb, ListChecks, MessageCircleQuestion, Pin, PinOff, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import type { LiveCard } from "@/lib/client/live";
import { cn } from "@/lib/utils";

const KIND: Record<LiveCard["kind"], { label: string; icon: typeof Lightbulb; tone: string }> = {
  talking_point: { label: "Say", icon: Lightbulb, tone: "text-link" },
  question: { label: "Ask", icon: MessageCircleQuestion, tone: "text-emerald-700 dark:text-emerald-300" },
  reminder: { label: "Remember", icon: BellRing, tone: "text-amber-700 dark:text-amber-300" },
  agenda: { label: "Not covered yet", icon: ListChecks, tone: "text-fuchsia-700 dark:text-fuchsia-300" },
};

const SWIPE_PX = 60;

/** One live card at a time, newest first. Swipe or use the arrows for the others. */
export function LiveCards({ cards, onPin, onDismiss }: { cards: LiveCard[]; onPin: (c: LiveCard) => void; onDismiss: (c: LiveCard) => void }) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const newest = cards[0]?.id;

  // A new card jumps to the front.
  useEffect(() => setIndex(0), [newest]);
  useEffect(() => {
    if (index > cards.length - 1) setIndex(Math.max(0, cards.length - 1));
  }, [cards.length, index]);

  const card = cards[index];
  if (!card) return null;
  const k = KIND[card.kind];
  const Icon = k.icon;
  const go = (d: number) => setIndex((i) => Math.min(cards.length - 1, Math.max(0, i + d)));

  return (
    <section aria-label="Live tips" aria-live="polite" className="px-5 pb-2 pt-2">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={card.id}
          initial={reduced ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? undefined : { opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
          drag={cards.length > 1 ? "x" : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.4}
          onDragEnd={(_e, info) => {
            if (info.offset.x < -SWIPE_PX) go(1);
            else if (info.offset.x > SWIPE_PX) go(-1);
          }}
          style={{ touchAction: "pan-y" }}
          className={cn("flex items-start gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm", card.pinned && "border-link/50")}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className={cn("flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider", k.tone)}>
              <Icon className="size-3.5" aria-hidden="true" /> {k.label}
            </span>
            <p className="text-[16px] leading-snug">{card.text}</p>
          </div>
          <div className="-mr-2 -mt-1 flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => onPin(card)}
              aria-pressed={card.pinned}
              aria-label={card.pinned ? "Unpin" : "Pin to keep with the summary"}
              className={cn("grid size-10 place-items-center rounded-full hover:bg-muted", card.pinned ? "text-link" : "text-muted-foreground")}
            >
              {card.pinned ? <PinOff className="size-4" aria-hidden="true" /> : <Pin className="size-4" aria-hidden="true" />}
            </button>
            <button type="button" onClick={() => onDismiss(card)} aria-label="Dismiss" className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-muted">
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
      {cards.length > 1 && (
        <div className="mt-1 flex items-center justify-center gap-1 text-xs text-muted-foreground">
          <button type="button" onClick={() => go(-1)} disabled={index === 0} aria-label="Newer tip" className="grid size-8 place-items-center rounded-full disabled:opacity-30">
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <span className="tabular-nums">{index + 1} of {cards.length}</span>
          <button type="button" onClick={() => go(1)} disabled={index === cards.length - 1} aria-label="Older tip" className="grid size-8 place-items-center rounded-full disabled:opacity-30">
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}

/** Small header toggle for live tips; pulses while a check is running. */
export function LiveToggle({ enabled, status, onChange }: { enabled: boolean; status: string; onChange: (on: boolean) => void }) {
  const reduced = useReducedMotion();
  const label = status === "unavailable" ? "Live tips unavailable" : enabled ? "Turn live tips off" : "Turn live tips on";
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      disabled={status === "unavailable"}
      aria-pressed={enabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium disabled:opacity-40",
        enabled ? "border-link/40 text-link" : "text-muted-foreground",
      )}
    >
      <motion.span
        aria-hidden="true"
        className={cn("size-2 rounded-full", enabled ? "bg-link" : "bg-muted-foreground/50")}
        animate={status === "thinking" && !reduced ? { opacity: [1, 0.25, 1] } : { opacity: 1 }}
        transition={status === "thinking" && !reduced ? { duration: 1, repeat: Infinity } : undefined}
      />
      Tips
    </button>
  );
}
