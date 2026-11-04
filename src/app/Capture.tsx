"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import MeetingPicker, { type Selection } from "./MeetingPicker";

const STATUS_LABEL: Record<CaptureStatus, string> = {
  idle: "Ready",
  starting: "Starting…",
  live: "Recording",
  reconnecting: "Reconnecting…",
  stalled: "Mic stopped",
  stopped: "Stopped",
  error: "Stopped with an error",
};

function clock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

type SaveState = "off" | "starting" | "saving" | "finishing" | "saved" | "failed";
type SummaryState = { state: "idle" } | { state: "working" } | { state: "ready"; href: string } | { state: "failed"; message: string; href: string };

const SUMMARY_ERRORS: Record<string, string> = {
  empty: "Nothing was saved to summarize.",
  not_configured: "Summaries need ANTHROPIC_API_KEY on the server.",
  refused: "The model declined to summarize this meeting.",
  rate_limited: "Too many requests. Open the meeting to retry.",
};

export default function Capture({ settings }: { settings: CaptureSettings }) {
  const [status, setStatus] = useState<CaptureStatus>("idle");
  const [detail, setDetail] = useState<string | undefined>();
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [interim, setInterim] = useState<string | null>(null);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [showDiag, setShowDiag] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("off");
  const [upload, setUpload] = useState<UploaderState | null>(null);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryState>({ state: "idle" });
  const session = useRef<CaptureSession | null>(null);
  const uploader = useRef<SegmentUploader | null>(null);
  const early = useRef<Omit<UploadSegment, "seq">[]>([]); // segments heard before the meeting record exists
  const stopped = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);

  const active = status === "starting" || status === "live" || status === "reconnecting" || status === "stalled";

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  useEffect(() => {
    if (saveState !== "saving") return;
    const t = setInterval(() => void uploader.current?.flush(), settings.storage.segment_flush_seconds * 1000);
    return () => clearInterval(t);
  }, [saveState, settings.storage.segment_flush_seconds]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [entries, interim]);

  useEffect(() => () => session.current?.stop(), []);

  const onEntry = useCallback((e: TranscriptEntry) => {
    setEntries((prev) => [...prev, e]);
    if (e.kind !== "segment") return;
    const seg = { speaker: e.speaker, startMs: Math.round(e.atSec * 1000), endMs: Math.round(e.endSec * 1000), text: e.text };
    if (uploader.current) uploader.current.add(seg);
    else early.current.push(seg);
  }, []);

  function start() {
    if (!selection) return;
    setEntries([]);
    setInterim(null);
    setDetail(undefined);
    setStartedAt(Date.now());
    setUpload(null);
    setMeetingId(null);
    setSummary({ state: "idle" });
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
    });
    session.current = s;
    void s.start().catch(() => undefined); // status callback already carries the error

    setSaveState("starting");
    void createMeeting(selection).then((meetingId) => {
      if (!meetingId) {
        setSaveState("failed");
        return;
      }
      const u = new SegmentUploader({
        clientId: selection.clientId,
        meetingId,
        maxPerPost: settings.storage.max_segments_per_post,
        onState: setUpload,
      });
      setMeetingId(meetingId);
      for (const seg of early.current) u.add(seg);
      early.current = [];
      uploader.current = u;
      if (stopped.current) {
        // Stop was tapped before the meeting record came back.
        setSaveState("finishing");
        void u.finish().then((ok) => {
          setSaveState(ok ? "saved" : "failed");
          if (ok) void summarize(selection.clientId, meetingId);
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
  const finishing = saveState === "finishing";

  return (
    <main className="capture">
      <header className={`bar status-${status}`}>
        <span className="dot" aria-hidden />
        <span className="label">{STATUS_LABEL[status]}</span>
        {startedAt && <span className="clock">{clock(elapsed)}</span>}
        <button className="link" onClick={() => setShowDiag((v) => !v)} aria-expanded={showDiag}>
          {showDiag ? "Hide details" : "Details"}
        </button>
      </header>

      {selection && (active || saveState !== "off") && (
        <div className="context">
          {selection.clientName} · {selection.projectName}
          <SaveBadge state={saveState} upload={upload} />
        </div>
      )}

      {status === "stalled" && (
        <div className="alert" role="alert">
          No audio for {settings.capture.stall_alert_seconds}s. iOS may have paused the mic.
          <button onClick={resume}>Resume</button>
        </div>
      )}
      {status === "error" && (
        <div className="alert" role="alert">
          <span>{describeCaptureError(detail)}</span>
          {detail !== "session" && <button onClick={resume}>Resume</button>}
        </div>
      )}
      {upload?.unauthorized && (
        <div className="alert" role="alert">
          <span>Your session expired, so new lines aren&apos;t being saved. Keep this page open, sign in from another tab, and they&apos;ll catch up.</span>
        </div>
      )}
      {saveState === "failed" && !active && (
        <div className="alert" role="alert">
          <span>Some lines couldn&apos;t be saved. They&apos;re still shown below until you leave this page.</span>
        </div>
      )}
      {active && diag?.wakeLock !== "on" && diag?.wakeLock !== undefined && (
        <div className="notice">
          Screen may lock. Set Settings › Display & Brightness › Auto-Lock to Never while docked.
        </div>
      )}

      {showDiag && diag && (
        <dl className="diag">
          <dt>Delay (median)</dt>
          <dd className={lagWarn ? "warn" : ""}>{diag.medianLagMs ?? "–"} ms</dd>
          <dt>Delay (last / max)</dt>
          <dd>{diag.lastLagMs ?? "–"} / {diag.maxLagMs ?? "–"} ms</dd>
          <dt>Reconnects</dt>
          <dd>{diag.reconnects}</dd>
          <dt>Mic level</dt>
          <dd><meter min={0} max={0.3} value={diag.level} /></dd>
          <dt>Audio</dt>
          <dd>{diag.audioState}, {diag.inputSampleRate ?? "–"} Hz</dd>
          <dt>Screen awake</dt>
          <dd>{diag.wakeLock}</dd>
          <dt>Saved / waiting</dt>
          <dd>{upload ? `${upload.saved} / ${upload.pending}` : "–"}</dd>
        </dl>
      )}

      {summary.state !== "idle" && !active && (
        <div className="summary-status" role="status">
          {summary.state === "working" && <span>Summarizing the meeting… usually under a minute.</span>}
          {summary.state === "ready" && <><span>Summary and action items ready.</span><a href={summary.href}>View</a></>}
          {summary.state === "failed" && <><span className="error">{summary.message}</span><a href={summary.href}>Open meeting</a></>}
        </div>
      )}

      {!active && !finishing && (
        <>
          <MeetingPicker templates={settings.templates} value={selection} onChange={setSelection} />
          <nav className="nav-links">
            {selection && <a href={`/p/${selection.clientId}/${selection.projectId}`}>Meetings for this project</a>}
            <a href="/items">Open items</a>
          </nav>
        </>
      )}

      <section className="transcript" aria-live="polite">
        {entries.length === 0 && !interim && (
          <p className="empty">{active ? "Listening…" : selection ? "Tap Start when the call begins." : "Choose a client and project."}</p>
        )}
        {mergeEntries(entries, settings.capture.merge_gap_seconds).map((e) =>
          e.kind === "gap" ? (
            <p key={e.id} className="gap">
              {clock(e.atSec)} · {e.seconds}s not captured ({e.reason === "stall" ? "mic paused" : "connection lost"})
            </p>
          ) : (
            <p key={e.id} className={`seg speaker-${(e.speaker ?? 0) % 4}`}>
              <span className="who">{e.speaker === null ? "Speaker" : `Speaker ${e.speaker + 1}`}</span>
              <span className="at">{clock(e.atSec)}</span>
              <span className="text">{e.text}</span>
            </p>
          ),
        )}
        {interim && <p className="interim">{interim}</p>}
        <div ref={bottom} />
      </section>

      <footer className="controls">
        {active ? (
          <button className="stop" onClick={stop}>Stop</button>
        ) : (
          <button className="start" onClick={start} disabled={!selection || finishing}>
            {finishing ? "Saving…" : "Start"}
          </button>
        )}
      </footer>
    </main>
  );
}

async function createMeeting(sel: Selection): Promise<string | null> {
  try {
    const res = await fetch(`/api/clients/${sel.clientId}/meetings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: sel.projectId, template: sel.template }),
    });
    if (!res.ok) return null;
    return ((await res.json()) as { id: string }).id;
  } catch {
    return null;
  }
}

function SaveBadge({ state, upload }: { state: SaveState; upload: UploaderState | null }) {
  const pending = upload?.pending ?? 0;
  const text: Record<SaveState, string> = {
    off: "",
    starting: "Preparing to save…",
    saving: upload?.failing ? `Retrying · ${pending} waiting` : "Saving",
    finishing: "Saving last lines…",
    saved: "Saved",
    failed: "Not saved",
  };
  return <span className={`save save-${state}${upload?.failing ? " save-retry" : ""}`}>{text[state]}</span>;
}
