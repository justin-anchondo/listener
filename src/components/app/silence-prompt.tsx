"use client";

import { MicOff } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect } from "react";

// Amber reads as "attention" in both themes without looking like an error.
const AMBER = "245, 158, 11";

/**
 * Asks whether to end the recording after a stretch with no speech. The phone
 * sits on a desk, so this has to be noticed from a distance: the screen dims,
 * its edges pulse amber, and the prompt sits mid screen with a glowing border.
 */
export function SilencePrompt({ open, seconds, onEnd, onKeep }: { open: boolean; seconds: number; onEnd: () => void; onKeep: () => void }) {
  const reduced = useReducedMotion();

  // A short buzz where the phone supports it (not iPhone Safari).
  useEffect(() => {
    if (open) navigator.vibrate?.([80, 60, 80]);
  }, [open]);

  const minutes = Math.floor(seconds / 60);
  const quietFor = minutes >= 1 ? `${minutes} minute${minutes === 1 ? "" : "s"}` : `${seconds} seconds`;
  const edgeDim = `inset 0 0 60px 12px rgba(${AMBER}, 0.35)`;
  const edgeBright = `inset 0 0 110px 34px rgba(${AMBER}, 0.85)`;
  const glowDim = `0 0 0 2px rgba(${AMBER}, 0.6), 0 0 24px 4px rgba(${AMBER}, 0.35)`;
  const glowBright = `0 0 0 3px rgba(${AMBER}, 1), 0 0 56px 14px rgba(${AMBER}, 0.65)`;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="silence"
          className="fixed inset-0 z-50 grid place-items-center px-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Dim the transcript, and pulse the screen edges amber. */}
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 bg-black/55"
            style={{ boxShadow: edgeBright }}
            animate={reduced ? undefined : { boxShadow: [edgeDim, edgeBright, edgeDim] }}
            transition={reduced ? undefined : { duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          />

          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="silence-title"
            aria-describedby="silence-body"
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.85, y: 16 }}
            animate={reduced
              ? { opacity: 1, boxShadow: glowBright }
              : { opacity: 1, y: 0, scale: [1, 1.025, 1], boxShadow: [glowDim, glowBright, glowDim] }}
            exit={reduced ? { opacity: 0, transition: { duration: 0.15 } } : { opacity: 0, scale: 0.92, transition: { duration: 0.15 } }}
            transition={reduced
              ? { duration: 0.2 }
              : {
                  opacity: { duration: 0.2 },
                  y: { type: "spring", stiffness: 380, damping: 26 },
                  scale: { duration: 1.4, repeat: Infinity, ease: "easeInOut" },
                  boxShadow: { duration: 1.4, repeat: Infinity, ease: "easeInOut" },
                }}
            className="relative w-full max-w-sm rounded-3xl bg-card p-6 text-center"
          >
            <span className="relative mx-auto mb-4 grid size-20 place-items-center">
              {!reduced && [0, 0.7].map((delay) => (
                <motion.span
                  key={delay}
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full"
                  style={{ backgroundColor: `rgba(${AMBER}, 0.45)` }}
                  animate={{ scale: [1, 1.9], opacity: [0.8, 0] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut", delay }}
                />
              ))}
              <span className="relative grid size-20 place-items-center rounded-full text-white" style={{ backgroundColor: `rgb(${AMBER})` }}>
                <MicOff className="size-9" aria-hidden="true" />
              </span>
            </span>
            <p id="silence-title" className="text-[22px] font-bold">Is the call over?</p>
            <p id="silence-body" className="mt-1 text-[15px] text-muted-foreground">No one has spoken for {quietFor}.</p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <button type="button" onClick={onKeep} className="min-h-12 rounded-xl border text-[15px] font-medium">Keep going</button>
              <button type="button" onClick={onEnd} autoFocus className="min-h-12 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground">End recording</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
