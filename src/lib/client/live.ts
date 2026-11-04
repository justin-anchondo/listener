"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type TriggerKind, detectTrigger, shouldCheck } from "@/lib/assist/triggers";
import type { TranscriptEntry } from "@/lib/capture/session";
import type { CaptureSettings } from "@/lib/config";
import { sendJson } from "@/lib/client/directory";

export type LiveCard = {
  id: string;
  kind: "talking_point" | "question" | "reminder" | "agenda";
  text: string;
  sourceMs: number | null;
  pinned: boolean;
  dismissed: boolean;
};

export type LiveStatus = "off" | "idle" | "thinking" | "paused" | "unavailable";

/**
 * Live talking points during a recording (SPEC 4.1). Checks on the interval
 * and right after a trigger line, one request at a time, sending only the
 * recent transcript window. Audio never leaves the capture path; this sends
 * text the phone already has.
 */
export function useLiveAssist({
  clientId,
  meetingId,
  recording,
  enabled,
  entries,
  settings,
}: {
  clientId: string | null;
  meetingId: string | null;
  recording: boolean;
  /** Off by default; the owner turns tips on per meeting. */
  enabled: boolean;
  entries: TranscriptEntry[];
  settings: CaptureSettings;
}) {
  const [cards, setCards] = useState<LiveCard[]>([]);
  const [status, setStatus] = useState<LiveStatus>("idle");
  const terms = useRef<string[]>([]);
  const state = useRef({ inFlight: false, lastAt: null as number | null, newLines: 0, seen: 0, pausedUntil: 0 });
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const limits = { intervalMs: settings.live.interval_seconds * 1000, minGapMs: settings.live.min_gap_seconds * 1000 };

  // New meeting: reset, then fetch the topic words to listen for.
  useEffect(() => {
    setCards([]);
    setStatus("idle");
    terms.current = [];
    state.current = { inFlight: false, lastAt: null, newLines: 0, seen: 0, pausedUntil: 0 };
    if (!clientId || !meetingId) return;
    void fetch(`/api/clients/${clientId}/meetings/${meetingId}/live`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { terms: [] }))
      .then((b: { terms: string[] }) => { terms.current = b.terms; })
      .catch(() => undefined);
  }, [clientId, meetingId]);

  const check = useCallback(async (reason: "interval" | TriggerKind) => {
    const st = state.current;
    const now = Date.now();
    if (!clientId || !meetingId || !enabled || now < st.pausedUntil) return;
    if (!shouldCheck(st, now, reason, limits)) return;
    const windowStartSec = Math.max(0, (entriesRef.current.at(-1)?.atSec ?? 0) - settings.live.window_minutes * 60);
    const lines = entriesRef.current
      .filter((e): e is Extract<TranscriptEntry, { kind: "segment" }> => e.kind === "segment" && e.endSec >= windowStartSec)
      .slice(-settings.storage.max_segments_per_post)
      .map((e) => ({ speaker: e.speaker, startMs: Math.round(e.atSec * 1000), text: e.text }));
    if (lines.length === 0) return;
    st.inFlight = true;
    st.lastAt = now;
    st.newLines = 0;
    setStatus("thinking");
    try {
      const res = await sendJson(`/api/clients/${clientId}/meetings/${meetingId}/live`, "POST", { reason, lines });
      if (res.ok) {
        const { cards: fresh } = (await res.json()) as { cards: LiveCard[] };
        if (fresh.length) setCards((prev) => [...fresh, ...prev]);
        setStatus("idle");
      } else if (res.status === 503) {
        setStatus("unavailable");
        st.pausedUntil = Number.POSITIVE_INFINITY;
      } else {
        // Rate limited or a model hiccup: skip a couple of intervals, then try again.
        setStatus("paused");
        st.pausedUntil = Date.now() + limits.intervalMs * 2;
      }
    } catch {
      setStatus("paused");
      st.pausedUntil = Date.now() + limits.intervalMs;
    } finally {
      st.inFlight = false;
    }
  }, [clientId, meetingId, enabled, limits.intervalMs, limits.minGapMs, settings.live.window_minutes, settings.storage.max_segments_per_post]); // eslint-disable-line react-hooks/exhaustive-deps

  // New final lines: count them and look for triggers.
  useEffect(() => {
    const st = state.current;
    const fresh = entries.slice(st.seen);
    st.seen = entries.length;
    let trigger: TriggerKind | null = null;
    for (const e of fresh) {
      if (e.kind !== "segment") continue;
      st.newLines++;
      trigger ??= detectTrigger(e.text, { ownerNames: settings.ownerNames, terms: terms.current });
    }
    if (trigger && recording) void check(trigger);
  }, [entries, recording, check, settings.ownerNames]);

  // The interval.
  useEffect(() => {
    if (!recording || !enabled || !meetingId) return;
    const t = setInterval(() => void check("interval"), 1000);
    return () => clearInterval(t);
  }, [recording, enabled, meetingId, check]);

  const update = useCallback(async (card: LiveCard, u: { pinned?: boolean; dismissed?: boolean }) => {
    setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, ...u } : c)));
    if (!clientId) return;
    const res = await sendJson(`/api/clients/${clientId}/suggestions/${card.id}`, "PATCH", u).catch(() => null);
    if (!res?.ok) setCards((prev) => prev.map((c) => (c.id === card.id ? card : c)));
  }, [clientId]);

  return {
    status: enabled ? status : ("off" as LiveStatus),
    cards: cards.filter((c) => !c.dismissed),
    pin: (c: LiveCard) => update(c, { pinned: !c.pinned }),
    dismiss: (c: LiveCard) => update(c, { dismissed: true }),
  };
}
