"use client";

import { ArrowUp, Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const MAX_LINES = 5;
const LINE_PX = 24;

/**
 * Prompt box after 21st.dev "Prompt Input dynamic grow" (zochory): a rounded
 * field that grows with the text, glows when focused, ripples where it's
 * tapped, and has a round send button. Adds a mic for dictation.
 */
export function PromptInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  voice,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
  disabled?: boolean;
  voice?: { available: boolean; listening: boolean; interim: string | null; start: () => void; stop: () => void };
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [ripples, setRipples] = useState<{ x: number; y: number; id: number }[]>([]);

  // Grow with the text, up to a few lines, then scroll.
  useEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, LINE_PX * MAX_LINES + 12)}px`;
  }, [value, voice?.interim]);

  const shown = voice?.listening && voice.interim ? `${value}${value ? " " : ""}${voice.interim}` : value;
  const canSend = !disabled && value.trim().length > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSubmit();
      }}
    >
      <div
        ref={box}
        onPointerDown={(e) => {
          const r = box.current?.getBoundingClientRect();
          if (!r) return;
          const id = Date.now();
          setRipples((list) => [...list.slice(-3), { x: e.clientX - r.left, y: e.clientY - r.top, id }]);
          setTimeout(() => setRipples((list) => list.filter((x) => x.id !== id)), 600);
        }}
        className={cn(
          "group relative flex items-end gap-1 overflow-hidden rounded-3xl border bg-card p-2 shadow-sm transition-shadow duration-300",
          "focus-within:shadow-[0_0_0_1px_rgba(147,51,234,0.25),0_0_10px_rgba(147,51,234,0.25),0_0_20px_rgba(236,72,153,0.15),0_0_30px_rgba(59,130,246,0.12)]",
          voice?.listening && "shadow-[0_0_0_1px_rgba(239,68,68,0.35),0_0_16px_rgba(239,68,68,0.25)]",
        )}
      >
        {ripples.map((r) => (
          <span
            key={r.id}
            aria-hidden="true"
            className="pointer-events-none absolute size-12 animate-ping rounded-full bg-gradient-to-r from-purple-400/20 via-pink-400/15 to-blue-400/20"
            style={{ left: r.x - 24, top: r.y - 24 }}
          />
        ))}
        {voice?.available && (
          <button
            type="button"
            onClick={voice.listening ? voice.stop : voice.start}
            aria-label={voice.listening ? "Stop dictation" : "Ask by voice"}
            aria-pressed={voice.listening}
            className={cn(
              "relative z-10 grid size-10 shrink-0 place-items-center rounded-full transition-colors",
              voice.listening ? "bg-red-500 text-white" : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {voice.listening ? <Square className="size-3.5" fill="currentColor" aria-hidden="true" /> : <Mic className="size-[18px]" aria-hidden="true" />}
            {voice.listening && <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-red-500/40" />}
          </button>
        )}
        <textarea
          ref={ref}
          rows={1}
          value={shown}
          readOnly={voice?.listening}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSubmit();
            }
          }}
          enterKeyHint="send"
          aria-label="Question"
          placeholder={voice?.listening ? "Listening…" : placeholder}
          className="relative z-10 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-base leading-6 outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          aria-label="Ask"
          disabled={!canSend}
          className="relative z-10 grid size-10 shrink-0 place-items-center rounded-full bg-foreground text-background transition-opacity disabled:opacity-30"
        >
          <ArrowUp className="size-5" aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
