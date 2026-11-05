"use client";

import { AlertTriangle, ChevronDown, MessageCircleQuestion, Mic, MonitorPlay, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClientAvatar } from "@/components/app/client-avatar";
import { ClientSheet, useClientSelection } from "@/components/app/client-sheet";
import { MeetingTypesSheet } from "@/components/app/edit-sheets";
import { LiveCards, LiveToggle } from "@/components/app/live-cards";
import { PageHeader } from "@/components/app/page-header";
import { RecallSheet } from "@/components/app/recall-sheet";
import { RecorderBar } from "@/components/app/recorder-bar";
import { SiriOrb } from "@/components/ui/siri-orb";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import type { CaptureSettings } from "@/lib/config";
import {
  CaptureSession,
  type CaptureStatus,
  type Diagnostics,
  type TranscriptEntry,
} from "@/lib/capture/session";
import { describeCaptureError } from "@/lib/capture/errors";
import { mergeEntries } from "@/lib/capture/merge";
import { SegmentUploader, type UploadSegment, type UploaderState } from "@/lib/capture/uploader";
import { sendJson } from "@/lib/client/directory";
import { type LiveCard, useLiveAssist } from "@/lib/client/live";
import { clock, dueSummary, localIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

// The phone already has its own transcript; when polling it asks for state and cards only.
const FOLLOW_NO_LINES = 2_147_483_647;

type SaveState = "off" | "starting" | "saving" | "finishing" | "saved" | "failed";
type SummaryState = { state: "idle" } | { state: "working" } | { state: "ready"; href: string } | { state: "failed"; message: string; href: string };

const SUMMARY_ERRORS: Record<string, string> = {
  empty: "Nothing was saved to summarize.",
  not_configured: "Summaries need ANTHROPIC_API_KEY on the server.",
  refused: "The model declined to summarize this meeting.",
  rate_limited: "Too many requests. Open the meeting to retry.",
};

const SPEAKER_TINT = ["text-sky-700 dark:text-sky-300", "text-amber-700 dark:text-amber-300", "text-emerald-700 dark:text-emerald-300", "text-fuchsia-700 dark:text-fuchsia-300"];

function Banner({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div role="alert" className="flex items-center gap-3 rounded-xl bg-destructive-soft px-4 py-3 text-[14px] text-destructive">
      <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">{children}</span>
      {action}
    </div>
  );
}

export default function Capture({ settings }: { settings: CaptureSettings }) {
  const reduced = useReducedMotion();
  const [status, setStatus] = useState<CaptureStatus>("idle");
  const [detail, setDetail] = useState<string | undefined>();
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [interim, setInterim] = useState<string | null>(null);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [showDiag, setShowDiag] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("off");
  const [upload, setUpload] = useState<UploaderState | null>(null);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryState>({ state: "idle" });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [typesOpen, setTypesOpen] = useState(false);
  const [due, setDue] = useState<{ overdue: number; week: number } | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [liveOn, setLiveOn] = useState(false); // live tips, per meeting, off by default
  const session = useRef<CaptureSession | null>(null);
  const uploader = useRef<SegmentUploader | null>(null);
  const early = useRef<Omit<UploadSegment, "seq">[]>([]); // segments heard before the meeting record exists
  const stopped = useRef(false);
  const level = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);

  const { clients, types, selection, error: dirError, refresh, choose } = useClientSelection(settings.templates);

  const active = status === "starting" || status === "live" || status === "reconnecting" || status === "stalled";
  const finishing = saveState === "finishing";
  const busy = active || finishing;
  const live = useLiveAssist({ clientId: selection?.clientId ?? null, meetingId, recording: active && !finishing, enabled: liveOn, entries, settings });

  // Live tips on/off and the card list are shared with any screen following
  // this meeting; a local toggle wins over the server for one poll round.
  const localToggleAt = useRef(0);
  const changeLiveTips = useCallback((on: boolean) => {
    setLiveOn(on);
    localToggleAt.current = Date.now();
    if (selection && meetingId) void sendJson(`/api/clients/${selection.clientId}/meetings/${meetingId}/live-tips`, "PATCH", { on }).catch(() => undefined);
  }, [selection, meetingId]);
  const { syncCards } = live;
  useEffect(() => {
    if (!active || !selection || !meetingId) return;
    const pollMs = settings.live.follow_poll_seconds * 1000;
    const t = setInterval(() => {
      void fetch(`/api/clients/${selection.clientId}/meetings/${meetingId}/follow?after=${FOLLOW_NO_LINES}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((s: { meeting: { liveTips: boolean }; suggestions: LiveCard[] } | null) => {
          if (!s) return;
          if (Date.now() - localToggleAt.current > pollMs * 2) setLiveOn(s.meeting.liveTips);
          syncCards(s.suggestions);
        })
        .catch(() => undefined);
    }, pollMs);
    return () => clearInterval(t);
  }, [active, selection, meetingId, settings.live.follow_poll_seconds, syncCards]);

  // Each meeting starts with live tips off unless turned on for it.
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !busy) setLiveOn(false);
    wasBusy.current = busy;
  }, [busy]);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  useEffect(() => {
    if (busy) document.body.dataset.recording = "1";
    else delete document.body.dataset.recording;
    return () => {
      delete document.body.dataset.recording;
    };
  }, [busy]);

  useEffect(() => {
    if (saveState !== "saving") return;
    const t = setInterval(() => void uploader.current?.flush(), settings.storage.segment_flush_seconds * 1000);
    return () => clearInterval(t);
  }, [saveState, settings.storage.segment_flush_seconds]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [entries, interim]);

  useEffect(() => () => session.current?.stop(), []);

  // Due this week for the selected client (open items view: action item fields only).
  useEffect(() => {
    if (!selection || busy) return;
    let cancelled = false;
    void fetch("/api/open-items", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then(({ items }: { items: { clientId: string; dueDate: string | null; snoozedUntil: string | null }[] }) => {
        if (cancelled) return;
        const mine = items.filter((i) => i.clientId === selection.clientId);
        const s = dueSummary(mine, localIsoDate());
        setDue({ overdue: s.overdue, week: s.week });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [selection, busy]);

  const onEntry = useCallback((e: TranscriptEntry) => {
    setEntries((prev) => [...prev, e]);
    if (e.kind !== "segment") return;
    const seg = { speaker: e.speaker, startMs: Math.round(e.atSec * 1000), endMs: Math.round(e.endSec * 1000), text: e.text };
    if (uploader.current) uploader.current.add(seg);
    else early.current.push(seg);
  }, []);

  function start() {
    if (!selection) return setSheetOpen(true);
    setEntries([]);
    setInterim(null);
    setDetail(undefined);
    setStartedAt(Date.now());
    setNow(Date.now());
    setUpload(null);
    setMeetingId(null);
    setSummary({ state: "idle" });
    setShowDiag(false);
    uploader.current = null;
    early.current = [];
    stopped.current = false;

    // Mic first, in the same tap (iOS requirement). The meeting record is created alongside.
    const s = new CaptureSession(settings, {
      onStatus: (st, d) => {
        setStatus(st);
        setDetail(d);
      },
      onEntry,
      onInterim: setInterim,
      onDiagnostics: setDiag,
      onLevel: (v) => {
        level.current = v;
      },
    });
    session.current = s;
    void s.start().catch(() => undefined); // status callback already carries the error

    const sel = selection;
    setSaveState("starting");
    void createMeeting(sel, liveOn).then((id) => {
      if (!id) {
        setSaveState("failed");
        return;
      }
      const u = new SegmentUploader({
        clientId: sel.clientId,
        meetingId: id,
        maxPerPost: settings.storage.max_segments_per_post,
        onState: setUpload,
      });
      setMeetingId(id);
      for (const seg of early.current) u.add(seg);
      early.current = [];
      uploader.current = u;
      if (stopped.current) {
        // Stop was tapped before the meeting record came back.
        setSaveState("finishing");
        void u.finish().then((ok) => {
          setSaveState(ok ? "saved" : "failed");
          if (ok) void summarize(sel.clientId, id);
        });
      } else {
        setSaveState("saving");
      }
    });
  }

  async function stop() {
    stopped.current = true;
    session.current?.stop();
    const u = uploader.current;
    if (!u) return; // the meeting record isn't back yet; start() finishes it when it arrives
    setSaveState("finishing");
    // The transcription service returns its last lines shortly after Stop.
    await new Promise((r) => setTimeout(r, 3500));
    const ok = await u.finish();
    setSaveState(ok ? "saved" : "failed");
    if (ok && selection && meetingId) await summarize(selection.clientId, meetingId);
  }

  async function summarize(clientId: string, id: string) {
    const href = `/m/${clientId}/${id}`;
    setSummary({ state: "working" });
    try {
      const res = await fetch(`/api/clients/${clientId}/meetings/${id}/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      if (res.ok) return setSummary({ state: "ready", href });
      const { error: code } = (await res.json().catch(() => ({}))) as { error?: string };
      setSummary({ state: "failed", href, message: SUMMARY_ERRORS[code ?? ""] ?? "Summary failed. Open the meeting to retry." });
    } catch {
      setSummary({ state: "failed", href, message: "Lost connection while summarizing. Open the meeting to retry." });
    }
  }

  async function resume() {
    await session.current?.resume().catch(() => undefined);
  }

  const elapsed = startedAt ? (now - startedAt) / 1000 : 0;
  const lagWarn = diag?.medianLagMs != null && diag.medianLagMs > settings.capture.target_latency_ms;
  const saveText =
    saveState === "starting" ? "Preparing to save…"
    : saveState === "saving" ? (upload?.failing ? `Retrying · ${upload.pending} lines waiting` : "Saving as you go · audio is never stored")
    : saveState === "finishing" ? "Saving the last lines…"
    : saveState === "failed" ? "Some lines couldn't be saved" : "";

  // ---------- Recording ----------
  const typeName = types.find((t) => t.key === selection?.template)?.name;
  if (busy) {
    return (
      <div className="flex min-h-dvh flex-col">
        {/* Pinned while recording so Tips and Ask stay reachable as the transcript scrolls. */}
        <div className="sticky top-0 z-30 bg-background/95 backdrop-blur">
          <PageHeader
            meta={selection ? `${selection.clientName} · ${selection.projectName}${typeName ? ` · ${typeName}` : ""}` : undefined}
            actions={selection && (
              <>
                <LiveToggle enabled={liveOn} status={live.status} onChange={changeLiveTips} />
                <button type="button" onClick={() => setAskOpen(true)} aria-label={`Ask about ${selection.clientName}`} className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                  <MessageCircleQuestion className="size-5" aria-hidden="true" />
                </button>
              </>
            )}
          />
          {liveOn && <LiveCards cards={live.cards} onPin={live.pin} onDismiss={live.dismiss} />}
        </div>

        <div className="flex flex-col gap-2 px-5 pt-2">
          {status === "stalled" && (
            <Banner action={<button type="button" onClick={resume} className="min-h-9 rounded-lg bg-destructive px-3 font-semibold text-white">Resume</button>}>
              No audio for {settings.capture.stall_alert_seconds}s. iOS may have paused the mic.
            </Banner>
          )}
          {status === "error" && (
            <Banner action={detail !== "session" ? <button type="button" onClick={resume} className="min-h-9 rounded-lg bg-destructive px-3 font-semibold text-white">Resume</button> : undefined}>
              {describeCaptureError(detail)}
            </Banner>
          )}
          {upload?.unauthorized && <Banner>Your session expired, so new lines aren&apos;t saving. Sign in from another tab and they&apos;ll catch up.</Banner>}
          {active && diag && diag.wakeLock !== "on" && (
            <p className="rounded-xl bg-warning-soft px-4 py-2.5 text-[13px] text-warning">
              The screen may lock. Set Auto-Lock to Never while docked.
            </p>
          )}
          {showDiag && diag && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-xl bg-surface px-4 py-3 text-[13px]">
              <dt className="text-muted-foreground">Delay (median)</dt>
              <dd className={cn("tabular-nums", lagWarn && "text-warning")}>{diag.medianLagMs ?? "–"} ms</dd>
              <dt className="text-muted-foreground">Delay (last / max)</dt>
              <dd className="tabular-nums">{diag.lastLagMs ?? "–"} / {diag.maxLagMs ?? "–"} ms</dd>
              <dt className="text-muted-foreground">Reconnects</dt>
              <dd>{diag.reconnects}</dd>
              <dt className="text-muted-foreground">Audio</dt>
              <dd>{diag.audioState}, {diag.inputSampleRate ?? "–"} Hz</dd>
              <dt className="text-muted-foreground">Screen awake</dt>
              <dd>{diag.wakeLock}</dd>
              <dt className="text-muted-foreground">Saved / waiting</dt>
              <dd className="tabular-nums">{upload ? `${upload.saved} / ${upload.pending}` : "–"}</dd>
            </dl>
          )}
        </div>

        <main aria-live="polite" className="flex flex-1 flex-col justify-end gap-4 px-5 pt-4 pb-40">
          {entries.length === 0 && !interim && (
            <p className="text-center text-[15px] text-muted-foreground">{finishing ? "Saving…" : "Listening…"}</p>
          )}
          {mergeEntries(entries, settings.capture.merge_gap_seconds).map((e) =>
            e.kind === "gap" ? (
              <p key={e.id} className="border-y border-dashed py-1 text-[13px] text-warning">
                {clock(e.atSec)} · {e.seconds}s not captured ({e.reason === "stall" ? "mic paused" : "connection lost"})
              </p>
            ) : (
              <motion.p
                key={e.id}
                initial={reduced ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-[17px] leading-relaxed"
              >
                <span className={cn("mr-2 text-[13px] font-semibold", SPEAKER_TINT[(e.speaker ?? 0) % 4])}>
                  {e.speaker === null ? "Speaker" : `Speaker ${e.speaker + 1}`}
                </span>
                {e.text}
              </motion.p>
            ),
          )}
          {interim && <p className="text-[17px] italic leading-relaxed text-muted-foreground">{interim}</p>}
          <div ref={bottom} />
        </main>

        <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-background via-background to-transparent px-4 pt-8 pb-safe">
          <div className="mx-auto flex max-w-xl flex-col items-center gap-2">
            <RecorderBar
              elapsedSec={elapsed}
              levelRef={level}
              live={status === "live"}
              stopping={finishing}
              onStop={stop}
              onInfo={() => setShowDiag((v) => !v)}
            />
            <p className="text-xs text-muted-foreground">{saveText}</p>
          </div>
        </div>
        {selection && (
          <RecallSheet open={askOpen} onClose={() => setAskOpen(false)} clientId={selection.clientId} clientName={selection.clientName} linkSources={false} />
        )}
      </div>
    );
  }

  // ---------- Ready ----------
  return (
    <>
      <PageHeader
        actions={
          <>
            <Link href="/live" className="hidden min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] text-muted-foreground hover:bg-muted lg:flex">
              <MonitorPlay className="size-4" aria-hidden="true" /> Live view
            </Link>
            <ThemeToggle />
          </>
        }
      />
      <main className="flex flex-1 flex-col items-center justify-center gap-9 px-5 py-6">
        {status === "error" && <div className="w-full"><Banner>{describeCaptureError(detail)}</Banner></div>}
        {dirError && <div className="w-full"><Banner>{dirError}</Banner></div>}

        <div className="flex flex-col items-center gap-3">
          <p className="text-[13px] font-medium text-muted-foreground">Recording for</p>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            disabled={!clients}
            className="flex min-h-11 max-w-full items-center gap-2 rounded-full border px-4 text-[15px]"
          >
            {selection ? (
              <>
                <ClientAvatar client={{ id: selection.clientId, name: selection.clientName, logoVersion: selection.logoVersion }} size={26} className="-ml-2 rounded-full" />
                <span className="truncate font-semibold">{selection.clientName}</span>
                <span className="text-muted-foreground">/</span>
                <span className="truncate">{selection.projectName}</span>
              </>
            ) : (
              <span className="font-semibold">{clients ? (clients.length ? "Choose a project" : "Add your first client") : "Loading…"}</span>
            )}
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
          {selection && (
            <div className="flex items-center gap-2">
              {typeName && (
                <button type="button" onClick={() => setSheetOpen(true)} className="min-h-8 rounded-full bg-muted px-3 text-[13px] text-muted-foreground">
                  {typeName}
                </button>
              )}
              <button
                type="button"
                role="switch"
                aria-checked={liveOn}
                onClick={() => setLiveOn((v) => !v)}
                className={cn(
                  "flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-[13px]",
                  liveOn ? "border-link/40 text-link" : "border-transparent bg-muted text-muted-foreground",
                )}
              >
                <Sparkles className="size-3.5" aria-hidden="true" />
                Live tips {liveOn ? "on" : "off"}
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-4">
          <motion.button
            type="button"
            onClick={start}
            disabled={!clients}
            aria-label="Start recording"
            whileTap={reduced ? undefined : { scale: 0.94 }}
            className="relative grid size-[168px] place-items-center rounded-full shadow-[0_12px_40px_rgba(124,92,255,0.28)] disabled:opacity-50"
          >
            <span className="absolute inset-0">
              <SiriOrb size="168px" colors={{ bg: "var(--background)" }} animationDuration={18} />
            </span>
            <Mic className="relative size-11 text-foreground/75 drop-shadow-[0_1px_8px_var(--background)] dark:text-white" strokeWidth={2} aria-hidden="true" />
          </motion.button>
          <p className="text-[15px] font-semibold">{selection ? "Tap to start" : "Choose a project to start"}</p>
        </div>

        {summary.state !== "idle" ? (
          <div role="status" className="flex w-full items-center gap-3 rounded-xl bg-surface px-4 py-3.5">
            <span className="flex-1 text-[15px]">
              {summary.state === "working" && "Summarizing the meeting… usually under a minute."}
              {summary.state === "ready" && "Summary and action items are ready."}
              {summary.state === "failed" && <span className="text-destructive">{summary.message}</span>}
            </span>
            {summary.state !== "working" && (
              <Link href={summary.href} className="min-h-9 rounded-lg bg-primary px-3 py-2 text-[14px] font-semibold text-primary-foreground">
                {summary.state === "ready" ? "View" : "Open"}
              </Link>
            )}
          </div>
        ) : (
          selection && due && (due.week > 0 || due.overdue > 0) && (
            <Link href="/items" className="flex w-full items-center gap-3 rounded-xl bg-surface px-4 py-3.5">
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">{selection.clientName} · action items</span>
                <span className="text-[15px] font-semibold">
                  {due.week > 0 ? `${due.week} due this week` : `${due.overdue} overdue`}
                </span>
              </span>
              {due.week > 0 && due.overdue > 0 && (
                <span className="rounded-full bg-destructive-soft px-2.5 py-1 text-xs font-semibold text-destructive">{due.overdue} overdue</span>
              )}
            </Link>
          )
        )}
      </main>

      {clients && (
        <ClientSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          clients={clients}
          selection={selection}
          types={types}
          onChoose={choose}
          onRefresh={refresh}
          onEditTypes={() => { setSheetOpen(false); setTypesOpen(true); }}
        />
      )}
      <MeetingTypesSheet open={typesOpen} onClose={() => { setTypesOpen(false); setSheetOpen(true); }} onChanged={() => void refresh()} />
    </>
  );
}

async function createMeeting(sel: { clientId: string; projectId: string; template: string }, liveTips: boolean): Promise<string | null> {
  try {
    const res = await fetch(`/api/clients/${sel.clientId}/meetings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: sel.projectId, template: sel.template, liveTips }),
    });
    if (!res.ok) return null;
    return ((await res.json()) as { id: string }).id;
  } catch {
    return null;
  }
}
