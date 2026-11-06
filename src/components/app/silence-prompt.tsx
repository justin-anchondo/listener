"use client";

import { MicOff } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect } from "react";

/**
 * Asks whether to end the recording after a stretch with no speech. Slides
 * up over the transcript with a pulsing icon so it's noticed at a glance.
 */
export function SilencePrompt({ open, seconds, onEnd, onKeep }: { open: boolean; seconds: number; onEnd: () => void; onKeep: () => void }) {
  const reduced = useReducedMotion();

  // A short buzz where the phone supports it (not iPhone Safari).
  useEffect(() => {
    if (open) navigator.vibrate?.([80, 60, 80]);
  }, [open]);

  const minutes = Math.floor(seconds / 60);
  const quietFor = minutes >= 1 ? `${minutes} minute${minutes === 1 ? "" : "s"}` : `${seconds} seconds`;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="alertdialog"
          aria-labelledby="silence-title"
          aria-describedby="silence-body"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+112px)] z-40 mx-auto max-w-md rounded-2xl border bg-card p-5 shadow-2xl"
        >
          <div className="flex items-start gap-4">
            <span className="relative grid size-12 shrink-0 place-items-center">
              {!reduced && (
                <>
                  <motion.span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-warning/30"
                    animate={{ scale: [1, 1.6], opacity: [0.7, 0] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                  />
                  <motion.span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-warning/30"
                    animate={{ scale: [1, 1.6], opacity: [0.7, 0] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut", delay: 0.8 }}
                  />
                </>
              )}
              <span className="relative grid size-12 place-items-center rounded-full bg-warning-soft text-warning">
                <MicOff className="size-6" aria-hidden="true" />
              </span>
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p id="silence-title" className="text-[17px] font-semibold">Is the call over?</p>
              <p id="silence-body" className="text-[14px] text-muted-foreground">No one has spoken for {quietFor}.</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={onKeep} className="min-h-12 rounded-xl border text-[15px] font-medium">Keep going</button>
            <button type="button" onClick={onEnd} autoFocus className="min-h-12 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground">End recording</button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
