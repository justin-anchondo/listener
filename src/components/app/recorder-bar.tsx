"use client";

// Recording pill styled after 21st.dev's "Tweenly AI Recorder" (MIT, Manjunath
// Irukulla): pulsing dot, timer, scrolling waveform, stop. Its own recording
// logic (MediaRecorder, audio blobs, playback) is deliberately not used:
// Listener never keeps audio. Levels come from CaptureSession instead.

import { Info, Square } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { clock } from "@/lib/format";
import { cn } from "@/lib/utils";

const SAMPLE_MS = 50;
const BAR = 2.5;
const BAR_GAP = 2;

export function RecorderBar({
  elapsedSec,
  levelRef,
  live,
  onStop,
  onInfo,
  stopping,
}: {
  elapsedSec: number;
  levelRef: React.RefObject<number>;
  live: boolean;
  onStop: () => void;
  onInfo: () => void;
  stopping?: boolean;
}) {
  const reduced = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const samples: number[] = [];
    let raf = 0;
    let last = performance.now();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = r.width;
    const H = r.height;
    const tick = (now: number) => {
      while (now - last >= SAMPLE_MS) {
        last += SAMPLE_MS;
        samples.push(live ? Math.min(1, (levelRef.current ?? 0) * 6) : 0);
        if (samples.length > 120) samples.shift();
      }
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = getComputedStyle(canvas).color;
      const step = BAR + BAR_GAP;
      for (let i = 0; i < samples.length; i++) {
        const v = samples[samples.length - 1 - i];
        const x = W - BAR - i * step;
        if (x < -BAR) break;
        const h = Math.max(BAR, v * H);
        ctx.globalAlpha = Math.min(1, x / (W * 0.25)) * 0.85;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, (H - h) / 2, BAR, h, BAR / 2);
        else ctx.rect(x, (H - h) / 2, BAR, h);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [levelRef, live]);

  return (
    <motion.div
      layout
      initial={reduced ? false : { opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 450, damping: 36 }}
      className="flex h-16 w-full items-center gap-3 rounded-full border bg-card pl-5 pr-2 shadow-sm"
    >
      <motion.span
        aria-hidden="true"
        className={cn("size-2.5 shrink-0 rounded-full", live ? "bg-red-500" : "bg-warning")}
        animate={live && !reduced ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
        transition={live && !reduced ? { duration: 1.4, repeat: Infinity, ease: [0.76, 0, 0.24, 1] } : undefined}
      />
      <span role="timer" aria-label={`Recording time ${clock(elapsedSec)}`} className="w-14 text-[17px] font-semibold tabular-nums">
        {clock(elapsedSec)}
      </span>
      <canvas ref={canvasRef} aria-hidden="true" className="h-8 min-w-0 flex-1 text-foreground" />
      <button
        type="button"
        onClick={onInfo}
        aria-label="Recording details"
        className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
      >
        <Info className="size-5" aria-hidden="true" />
      </button>
      <motion.button
        type="button"
        onClick={onStop}
        disabled={stopping}
        aria-label="Stop recording"
        whileTap={reduced ? undefined : { scale: 0.9 }}
        className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
      >
        <Square className="size-4" fill="currentColor" aria-hidden="true" />
      </motion.button>
    </motion.div>
  );
}
