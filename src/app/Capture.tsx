"use client";

import { useEffect, useRef, useState } from "react";
import type { CaptureSettings } from "@/lib/config";
import {
  CaptureSession,
  type CaptureStatus,
  type Diagnostics,
  type TranscriptEntry,
} from "@/lib/capture/session";

const STATUS_LABEL: Record<CaptureStatus, string> = {
  idle: "Ready",
  starting: "Starting…",
  live: "Recording",
  reconnecting: "Reconnecting…",
  stalled: "Mic stopped",
  stopped: "Stopped",
  error: "Stopped with an error",
};

const ERROR_HELP: Record<string, string> = {
  session: "Your session expired. Reload the page and enter the access code.",
  reconnect: "Couldn't reconnect to transcription. Check the connection and tap Resume.",
  NotAllowedError: "Microphone permission was denied. Allow it in Settings › Safari › Microphone.",
  NotFoundError: "No microphone found.",
};

function clock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

export default function Capture({ settings }: { settings: CaptureSettings }) {
  const [status, setStatus] = useState<CaptureStatus>("idle");
  const [detail, setDetail] = useState<string | undefined>();
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [interim, setInterim] = useState<string | null>(null);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [showDiag, setShowDiag] = useState(false);
  const session = useRef<CaptureSession | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const active = status === "starting" || status === "live" || status === "reconnecting" || status === "stalled";

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [entries, interim]);

  useEffect(() => () => session.current?.stop(), []);

  async function start() {
    setEntries([]);
    setInterim(null);
    setDetail(undefined);
    setStartedAt(Date.now());
    const s = new CaptureSession(settings, {
      onStatus: (st, d) => {
        setStatus(st);
        setDetail(d);
      },
      onEntry: (e) => setEntries((prev) => [...prev, e]),
      onInterim: setInterim,
      onDiagnostics: setDiag,
    });
    session.current = s;
    await s.start().catch(() => undefined); // status callback already carries the error
  }

  function stop() {
    session.current?.stop();
  }

  async function resume() {
    await session.current?.resume().catch(() => undefined);
  }

  const elapsed = startedAt ? (now - startedAt) / 1000 : 0;
  const lagWarn = diag?.medianLagMs != null && diag.medianLagMs > settings.capture.target_latency_ms;

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

      {status === "stalled" && (
        <div className="alert" role="alert">
          No audio for {settings.capture.stall_alert_seconds}s. iOS may have paused the mic.
          <button onClick={resume}>Resume</button>
        </div>
      )}
      {status === "error" && (
        <div className="alert" role="alert">
          {ERROR_HELP[detail ?? ""] ?? "Something went wrong."}
          {detail !== "session" && <button onClick={resume}>Resume</button>}
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
        </dl>
      )}

      <section className="transcript" aria-live="polite">
        {entries.length === 0 && !interim && (
          <p className="empty">{active ? "Listening…" : "Tap Start when the call begins."}</p>
        )}
        {entries.map((e) =>
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
          <button className="start" onClick={start}>Start</button>
        )}
      </footer>
    </main>
  );
}
