"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CaptureSession } from "@/lib/capture/session";
import type { CaptureSettings } from "@/lib/config";

/**
 * Dictation for short typed prompts (Ask). Streams to the same transcription
 * vendor as recordings, with the same short lived token; audio is never
 * stored or sent anywhere else (CLAUDE.md rules 1 and 8).
 */
export function useVoiceInput(settings: CaptureSettings | undefined, onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const session = useRef<CaptureSession | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const stop = useCallback(() => {
    session.current?.stop();
    session.current = null;
    setListening(false);
    setInterim(null);
  }, []);

  const start = useCallback(() => {
    if (!settings || session.current) return;
    setError(null);
    const s = new CaptureSession(settings, {
      onStatus: (st) => {
        if (st === "error") {
          setError("Couldn't use the microphone. Type the question instead.");
          stop();
        }
      },
      onEntry: (e) => {
        if (e.kind === "segment" && e.text.trim()) onTextRef.current(e.text.trim());
      },
      onInterim: setInterim,
      onDiagnostics: () => undefined,
    });
    session.current = s;
    setListening(true);
    void s.start().catch(() => undefined);
  }, [settings, stop]);

  useEffect(() => () => session.current?.stop(), []);

  return { available: !!settings, listening, interim, error, start, stop };
}
