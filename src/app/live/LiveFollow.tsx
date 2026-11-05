"use client";

import { Bell, BellOff, ChevronLeft, MessageCircleQuestion, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClientAvatar } from "@/components/app/client-avatar";
import { KIND, LiveCardList } from "@/components/app/live-cards";
import { RecallSheet } from "@/components/app/recall-sheet";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import type { TranscriptEntry } from "@/lib/capture/session";
import { mergeEntries } from "@/lib/capture/merge";
import { sendJson } from "@/lib/client/directory";
import type { LiveCard } from "@/lib/client/live";
import { clock } from "@/lib/format";
import { cn } from "@/lib/utils";

type Active = { id: string; clientId: string; clientName: string; logoVersion: number | null; projectName: string; template: string; startedAt: string; liveTips: boolean };
type Segment = { seq: number; speaker: number | null; startMs: number; endMs: number; text: string };
type FollowState = { meeting: { startedAt: string; endedAt: string | null; liveTips: boolean }; segments: Segment[]; suggestions: LiveCard[] };

const SPEAKER_TINT = ["text-sky-700 dark:text-sky-300", "text-amber-700 dark:text-amber-300", "text-emerald-700 dark:text-emerald-300", "text-fuchsia-700 dark:text-fuchsia-300"];
const ALERTS_KEY = "listener.desktopAlerts"; // per browser preference
const FRESH_MS = 8000;
const NEAR_BOTTOM_PX = 120;

function readAlerts(): boolean {
  try {
    return localStorage.getItem(ALERTS_KEY) === "1";
  } catch {
    return false;
  }
}

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 401) {
    window.location.assign("/");
    return null;
  }
  return res.ok ? ((await res.json()) as T) : null;
}

/**
 * Desktop companion to a recording on the phone (SPEC 4.5): live transcript,
 * live tips with pin and dismiss, Ask, and optional desktop alerts. The phone
 * stays the microphone; this screen only reads what it saves and shares the
 * tips switch.
 */
export default function LiveFollow({ pollSeconds, mergeGapSeconds }: { pollSeconds: number; mergeGapSeconds: number }) {
  const [active, setActive] = useState<Active[] | null>(null);
  const [meeting, setMeeting] = useState<Active | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [cards, setCards] = useState<LiveCard[]>([]);
  const [tipsOn, setTipsOn] = useState(false);
  const [endedAt, setEndedAt] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [askOpen, setAskOpen] = useState(false);
  const [alerts, setAlerts] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [unseen, setUnseen] = useState(0);
  const [lost, setLost] = useState(false);
  const lastSeq = useRef(-1);
  const seen = useRef<Set<string> | null>(null);
  const tipsToggledAt = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const pollMs = pollSeconds * 1000;

  useEffect(() => setAlerts(readAlerts() && typeof Notification !== "undefined" && Notification.permission === "granted"), []);

  // Waiting: look for a recording on the phone.
  useEffect(() => {
    if (meeting) return;
    let stop = false;
    const look = async () => {
      const r = await getJson<{ meetings: Active[] }>("/api/live/now").catch(() => null);
      if (stop || !r) return;
      setActive(r.meetings);
      if (r.meetings.length === 1) follow(r.meetings[0]);
    };
    void look();
    const t = setInterval(look, pollMs * 2);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [meeting, pollMs]); // eslint-disable-line react-hooks/exhaustive-deps

  function follow(m: Active) {
    lastSeq.current = -1;
    seen.current = null;
    setSegments([]);
    setCards([]);
    setEndedAt(null);
    setTipsOn(m.liveTips);
    setMeeting(m);
  }

  const onNewCards = useCallback((server: LiveCard[]) => {
    const visible = [...server].reverse().filter((c) => !c.dismissed);
    setCards(visible);
    if (seen.current === null) {
      seen.current = new Set(server.map((c) => c.id)); // what was already there when we started following
      return;
    }
    const added = visible.filter((c) => !seen.current!.has(c.id));
    if (added.length === 0) return;
    for (const c of added) seen.current.add(c.id);
    setFresh((s) => new Set([...s, ...added.map((c) => c.id)]));
    setTimeout(() => setFresh((s) => new Set([...s].filter((id) => !added.some((c) => c.id === id)))), FRESH_MS);
    if (document.hidden) {
      setUnseen((n) => n + added.length);
      if (readAlerts() && typeof Notification !== "undefined" && Notification.permission === "granted") {
        for (const c of added) {
          const n = new Notification(`Listener · ${KIND[c.kind].label}`, { body: c.text, tag: c.id });
          n.onclick = () => {
            window.focus();
            n.close();
          };
        }
      }
    }
  }, []);

  // Following: new lines and cards every poll.
  useEffect(() => {
    if (!meeting) return;
    let stop = false;
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        const s = await getJson<FollowState>(`/api/clients/${meeting.clientId}/meetings/${meeting.id}/follow?after=${lastSeq.current}`);
        if (stop) return;
        if (!s) {
          setLost(true);
          return;
        }
        setLost(false);
        if (s.segments.length) {
          lastSeq.current = s.segments[s.segments.length - 1].seq;
          setSegments((prev) => [...prev, ...s.segments.filter((x) => !prev.some((p) => p.seq === x.seq))]);
        }
        if (Date.now() - tipsToggledAt.current > pollMs * 2) setTipsOn(s.meeting.liveTips);
        onNewCards(s.suggestions);
        setEndedAt(s.meeting.endedAt);
      } catch {
        if (!stop) setLost(true);
      } finally {
        busy = false;
      }
    };
    void tick();
    const t = setInterval(tick, pollMs);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [meeting, pollMs, onNewCards]);

  useEffect(() => {
    if (!meeting || endedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [meeting, endedAt]);

  // Title badge for tips that arrived while this tab was in the background.
  useEffect(() => {
    document.title = unseen ? `(${unseen}) Listener live` : "Listener live";
  }, [unseen]);
  useEffect(() => {
    const onVis = () => !document.hidden && setUnseen(0);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Keep the newest line in view unless the owner has scrolled up to read.
  const stick = useRef(true);
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [segments]);

  async function toggleTips() {
    if (!meeting) return;
    const on = !tipsOn;
    setTipsOn(on);
    tipsToggledAt.current = Date.now();
    const res = await sendJson(`/api/clients/${meeting.clientId}/meetings/${meeting.id}/live-tips`, "PATCH", { on }).catch(() => null);
    if (!res?.ok) setTipsOn(!on);
  }

  async function toggleAlerts() {
    if (typeof Notification === "undefined") return;
    let on = !alerts;
    if (on && Notification.permission !== "granted") on = (await Notification.requestPermission()) === "granted";
    setAlerts(on);
    try {
      localStorage.setItem(ALERTS_KEY, on ? "1" : "0");
    } catch {
      // storage unavailable; alerts stay on for this tab
    }
  }

  async function updateCard(card: LiveCard, u: { pinned?: boolean; dismissed?: boolean }) {
    if (!meeting) return;
    setCards((prev) => (u.dismissed ? prev.filter((c) => c.id !== card.id) : prev.map((c) => (c.id === card.id ? { ...c, ...u } : c))));
    await sendJson(`/api/clients/${meeting.clientId}/suggestions/${card.id}`, "PATCH", u).catch(() => null);
  }

  const entries: TranscriptEntry[] = segments.map((s) => ({ kind: "segment", id: s.seq, speaker: s.speaker, text: s.text, atSec: s.startMs / 1000, endSec: s.endMs / 1000 }));
  const elapsed = meeting ? ((endedAt ? new Date(endedAt).getTime() : now) - new Date(meeting.startedAt).getTime()) / 1000 : 0;

  // ---------- Waiting ----------
  if (!meeting) {
    return (
      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between px-6 py-4">
          <Link href="/meetings" className="flex items-center gap-1 text-[15px] text-muted-foreground"><ChevronLeft className="size-4" aria-hidden="true" />Listener</Link>
          <ThemeToggle />
        </header>
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
          <span className="relative flex size-3"><span className="absolute inline-flex size-full animate-ping rounded-full bg-link/60" /><span className="relative inline-flex size-3 rounded-full bg-link" /></span>
          {active && active.length > 1 ? (
            <>
              <h1 className="text-xl font-semibold">More than one recording is running</h1>
              <ul className="w-full overflow-hidden rounded-xl bg-surface text-left">
                {active.map((m) => (
                  <li key={m.id} className="border-b border-background last:border-b-0">
                    <button type="button" onClick={() => follow(m)} className="flex min-h-14 w-full items-center gap-3 px-4">
                      <ClientAvatar client={{ id: m.clientId, name: m.clientName, logoVersion: m.logoVersion }} size={30} />
                      <span className="flex-1 truncate text-[15px]"><b>{m.clientName}</b> · {m.projectName}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold">Waiting for a recording</h1>
              <p className="text-[15px] text-muted-foreground">
                Start recording on your phone. This screen picks it up within a few seconds and shows the transcript and live tips here.
              </p>
            </>
          )}
        </main>
      </div>
    );
  }

  // ---------- Following ----------
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b px-6 py-3">
        <Link href="/meetings" aria-label="Back to meetings" className="-ml-2 grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted">
          <ChevronLeft className="size-5" aria-hidden="true" />
        </Link>
        <ClientAvatar client={{ id: meeting.clientId, name: meeting.clientName, logoVersion: meeting.logoVersion }} size={32} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[16px] font-semibold">{meeting.clientName} · {meeting.projectName}</span>
          <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
            {endedAt ? "Ended" : <><span className="size-2 rounded-full bg-red-500" aria-hidden="true" />Recording on your phone</>}
            <span className="tabular-nums">{clock(Math.max(0, elapsed))}</span>
            {lost && <span className="text-warning">· reconnecting…</span>}
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={tipsOn}
          onClick={toggleTips}
          disabled={!!endedAt}
          className={cn("flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-[14px] disabled:opacity-40", tipsOn ? "border-link/40 text-link" : "text-muted-foreground")}
        >
          <Sparkles className="size-4" aria-hidden="true" /> Live tips {tipsOn ? "on" : "off"}
        </button>
        <button
          type="button"
          onClick={toggleAlerts}
          aria-pressed={alerts}
          title="Desktop alerts for new tips. They can show on a shared screen."
          className={cn("flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-[14px]", alerts ? "border-link/40 text-link" : "text-muted-foreground")}
        >
          {alerts ? <Bell className="size-4" aria-hidden="true" /> : <BellOff className="size-4" aria-hidden="true" />} Alerts
        </button>
        <button type="button" onClick={() => setAskOpen(true)} className="flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-[14px] text-muted-foreground hover:bg-muted">
          <MessageCircleQuestion className="size-4" aria-hidden="true" /> Ask
        </button>
        <ThemeToggle />
      </header>

      {endedAt && (
        <div role="status" className="flex flex-wrap items-center gap-3 border-b bg-surface px-6 py-2.5 text-[14px]">
          <span className="flex-1">The recording ended. The summary is usually ready on the meeting page within a minute.</span>
          <Link href={`/m/${meeting.clientId}/${meeting.id}`} className="font-semibold text-link">Open meeting</Link>
          <button type="button" onClick={() => setMeeting(null)} className="font-semibold text-link">Wait for the next one</button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
          }}
          aria-label="Transcript"
          className="order-2 min-h-0 overflow-y-auto px-6 py-5 lg:order-1"
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {entries.length === 0 && <p className="text-[15px] text-muted-foreground">Listening… lines appear here a couple of seconds after they&apos;re spoken.</p>}
            {mergeEntries(entries, mergeGapSeconds).map((e) => e.kind === "segment" && (
              <p key={e.id} className="text-[17px] leading-relaxed">
                <span className={cn("mr-2 text-[13px] font-semibold", SPEAKER_TINT[(e.speaker ?? 0) % 4])}>
                  {e.speaker === null ? "Speaker" : `Speaker ${e.speaker + 1}`}
                </span>
                <span className="mr-2 text-[12px] tabular-nums text-muted-foreground">{clock(e.atSec)}</span>
                {e.text}
              </p>
            ))}
          </div>
        </section>
        <aside aria-label="Live tips panel" className="order-1 min-h-0 overflow-y-auto border-b bg-surface/50 px-5 py-5 lg:order-2 lg:border-b-0 lg:border-l">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Live tips</h2>
          {!tipsOn && (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed px-4 py-4 text-[14px] text-muted-foreground">
              Live tips are off for this meeting.
              {!endedAt && <button type="button" onClick={toggleTips} className="font-semibold text-link">Turn them on</button>}
            </div>
          )}
          {tipsOn && cards.length === 0 && <p className="text-[14px] text-muted-foreground">Tips show up here when something is worth your attention.</p>}
          <LiveCardList cards={cards} freshIds={fresh} onPin={(c) => void updateCard(c, { pinned: !c.pinned })} onDismiss={(c) => void updateCard(c, { dismissed: true })} />
        </aside>
      </div>

      <RecallSheet open={askOpen} onClose={() => setAskOpen(false)} clientId={meeting.clientId} clientName={meeting.clientName} linkSources={!!endedAt} />
    </div>
  );
}
