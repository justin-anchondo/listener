// Browser only. Owns the mic, the transcription socket, the wake lock, and
// recovery from drops and stalls. Transcript text lives in memory only: it is
// handed to callbacks and never written to storage or logs (CLAUDE.md rules 1, 2).

import type { CaptureSettings } from "@/lib/config";
import { Downsampler, rms } from "@/lib/audio/downsampler";
import { buildListenUrl, listenProtocols } from "@/lib/stt/listen-url";
import { parseResult } from "@/lib/stt/results";
import { isStalled, median, reconnectDelayMs, transcriptLagMs } from "@/lib/stt/timing";

export type CaptureStatus = "idle" | "starting" | "live" | "reconnecting" | "stalled" | "stopped" | "error";

export type TranscriptEntry =
  | { kind: "segment"; id: number; speaker: number | null; text: string; atSec: number }
  | { kind: "gap"; id: number; atSec: number; seconds: number; reason: "reconnect" | "stall" };

export type Diagnostics = {
  lastLagMs: number | null;
  medianLagMs: number | null;
  maxLagMs: number | null;
  reconnects: number;
  level: number;
  inputSampleRate: number | null;
  audioState: string;
  wakeLock: "on" | "off" | "unsupported";
};

export type CaptureCallbacks = {
  onStatus(status: CaptureStatus, detail?: string): void;
  onEntry(entry: TranscriptEntry): void;
  onInterim(text: string | null): void;
  onDiagnostics(diag: Diagnostics): void;
};

export class SessionExpiredError extends Error {}

const LAG_SAMPLES_KEPT = 200;

export class CaptureSession {
  private status: CaptureStatus = "idle";
  private stopping = false;
  private nextId = 1;

  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private worklet: AudioWorkletNode | null = null;
  private downsampler: Downsampler | null = null;
  private pending: Int16Array[] = [];
  private pendingSamples = 0;

  private ws: WebSocket | null = null;
  private socketOffsetSec: number | null = null; // meeting time when this socket got its first audio
  private socketSamplesSent = 0;
  private reconnectAttempt = 0;
  private reconnects = 0;
  private gapStartedAtSec: number | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private meetingStartMs = 0;
  private lastFrameAtMs = 0;
  private stallTimer: ReturnType<typeof setInterval> | null = null;
  private stallStartedAtSec: number | null = null;

  private wakeLock: WakeLockSentinel | null = null;
  private wakeLockState: Diagnostics["wakeLock"] = "off";
  private lags: number[] = [];
  private level = 0;

  constructor(
    private readonly settings: CaptureSettings,
    private readonly cb: CaptureCallbacks,
  ) {}

  async start(): Promise<void> {
    this.stopping = false;
    this.setStatus("starting");
    this.meetingStartMs = performance.now();
    try {
      await this.startAudio();
      await this.acquireWakeLock();
      document.addEventListener("visibilitychange", this.onVisibility);
      this.stallTimer = setInterval(this.checkStall, 1000);
      await this.connect();
    } catch (err) {
      this.teardown();
      this.setStatus("error", err instanceof SessionExpiredError ? "session" : errorName(err));
      throw err;
    }
  }

  /** User tapped Resume after an interruption. Must run inside a user gesture on iOS. */
  async resume(): Promise<void> {
    const track = this.stream?.getAudioTracks()[0];
    if (!track || track.readyState === "ended") {
      this.stopAudio();
      await this.startAudio();
    } else {
      await this.ctx?.resume();
    }
    this.lastFrameAtMs = performance.now();
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
      this.reconnectAttempt = 0;
      await this.connect();
    }
  }

  stop(): void {
    this.stopping = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const ws = this.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      this.flush(true);
      ws.send(JSON.stringify({ type: "CloseStream" }));
      // Let the vendor return the last finals, then force close.
      setTimeout(() => ws.readyState !== WebSocket.CLOSED && ws.close(), 3000);
    } else {
      ws?.close();
    }
    this.teardown();
    this.cb.onInterim(null);
    this.setStatus("stopped");
  }

  private nowSec(): number {
    return (performance.now() - this.meetingStartMs) / 1000;
  }

  private setStatus(status: CaptureStatus, detail?: string): void {
    this.status = status;
    this.cb.onStatus(status, detail);
  }

  // ---- audio ----

  private async startAudio(): Promise<void> {
    const { capture } = this.settings;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: capture.echo_cancellation,
        noiseSuppression: capture.noise_suppression,
        autoGainControl: capture.auto_gain_control,
      },
    });
    const ctx = new AudioContext();
    this.ctx = ctx;
    await ctx.audioWorklet.addModule("/pcm-worklet.js");
    const source = ctx.createMediaStreamSource(this.stream);
    const worklet = new AudioWorkletNode(ctx, "pcm-capture");
    const mute = ctx.createGain();
    mute.gain.value = 0; // keeps the graph pulling audio without playing it back
    source.connect(worklet).connect(mute).connect(ctx.destination);
    this.worklet = worklet;
    this.downsampler = new Downsampler(ctx.sampleRate, capture.sample_rate_hz);
    worklet.port.onmessage = (e: MessageEvent<Float32Array>) => this.onFrame(e.data);
    ctx.onstatechange = () => this.emitDiagnostics();
    await ctx.resume();
    this.lastFrameAtMs = performance.now();
    this.emitDiagnostics();
  }

  private stopAudio(): void {
    if (this.worklet) this.worklet.port.onmessage = null;
    this.worklet?.disconnect();
    this.worklet = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.pending = [];
    this.pendingSamples = 0;
  }

  private onFrame(frame: Float32Array): void {
    this.lastFrameAtMs = performance.now();
    this.level = rms(frame);
    if (!this.downsampler) return;
    const pcm = this.downsampler.process(frame);
    this.pending.push(pcm);
    this.pendingSamples += pcm.length;
    this.flush(false);
  }

  private flush(force: boolean): void {
    const { capture } = this.settings;
    const chunkSamples = (capture.sample_rate_hz * capture.chunk_ms) / 1000;
    if (!force && this.pendingSamples < chunkSamples) return;
    if (this.pendingSamples === 0) return;
    const chunk = new Int16Array(this.pendingSamples);
    let at = 0;
    for (const p of this.pending) {
      chunk.set(p, at);
      at += p.length;
    }
    this.pending = [];
    this.pendingSamples = 0;
    // While disconnected, audio is dropped (not buffered) and the gap is marked.
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    if (this.socketOffsetSec === null) this.socketOffsetSec = this.nowSec();
    this.ws.send(chunk.buffer);
    this.socketSamplesSent += chunk.length;
  }

  private checkStall = (): void => {
    if (this.status === "stopped" || this.status === "error") return;
    const stalled = isStalled(this.lastFrameAtMs, performance.now(), this.settings.capture.stall_alert_seconds);
    if (stalled && this.status !== "stalled") {
      this.stallStartedAtSec = this.nowSec();
      this.setStatus("stalled");
    } else if (!stalled && this.status === "stalled") {
      this.markGap(this.stallStartedAtSec, "stall");
      this.stallStartedAtSec = null;
      this.setStatus(this.ws?.readyState === WebSocket.OPEN ? "live" : "reconnecting");
    }
    this.emitDiagnostics();
  };

  // ---- socket ----

  private async fetchToken(): Promise<string> {
    const res = await fetch("/api/stt/token", { method: "POST", cache: "no-store" });
    if (res.status === 401) throw new SessionExpiredError();
    if (!res.ok) throw new Error(`token ${res.status}`);
    const body = (await res.json()) as { accessToken: string };
    return body.accessToken;
  }

  private async connect(): Promise<void> {
    const token = await this.fetchToken();
    if (this.stopping) return;
    const ws = new WebSocket(buildListenUrl(this.settings), listenProtocols(token));
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    this.socketOffsetSec = null;
    this.socketSamplesSent = 0;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.reconnectAttempt = 0;
      if (this.gapStartedAtSec !== null) {
        this.markGap(this.gapStartedAtSec, "reconnect");
        this.gapStartedAtSec = null;
      }
      if (this.status !== "stalled") this.setStatus("live");
    };
    ws.onmessage = (e) => {
      if (this.ws !== ws || typeof e.data !== "string") return;
      this.onMessage(e.data);
    };
    ws.onclose = () => {
      if (this.ws !== ws || this.stopping) return;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    const { capture } = this.settings;
    if (this.gapStartedAtSec === null) this.gapStartedAtSec = this.nowSec();
    this.cb.onInterim(null);
    const delay = reconnectDelayMs(this.reconnectAttempt, capture.reconnect_max_attempts, capture.reconnect_backoff_ms);
    if (delay === null) {
      this.setStatus("error", "reconnect");
      return;
    }
    this.reconnectAttempt += 1;
    this.reconnects += 1;
    this.setStatus("reconnecting");
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((err) => {
        if (err instanceof SessionExpiredError) {
          this.setStatus("error", "session");
          return;
        }
        this.scheduleReconnect();
      });
    }, delay);
    this.emitDiagnostics();
  }

  private onMessage(raw: string): void {
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const result = parseResult(msg);
    if (!result) return;

    if (!result.isFinal) {
      this.cb.onInterim(result.segments.map((s) => s.text).join(" ") || null);
      return;
    }
    const sentSec = this.socketSamplesSent / this.settings.capture.sample_rate_hz;
    if (result.segments.length > 0) {
      this.lags.push(transcriptLagMs(sentSec, result.audioEndSec));
      if (this.lags.length > LAG_SAMPLES_KEPT) this.lags.shift();
    }
    const offset = this.socketOffsetSec ?? 0;
    for (const seg of result.segments) {
      this.cb.onEntry({ kind: "segment", id: this.nextId++, speaker: seg.speaker, text: seg.text, atSec: offset + seg.startSec });
    }
    this.cb.onInterim(null);
    this.emitDiagnostics();
  }

  private markGap(startSec: number | null, reason: "reconnect" | "stall"): void {
    if (startSec === null) return;
    const seconds = Math.round(this.nowSec() - startSec);
    if (seconds < 1) return;
    this.cb.onEntry({ kind: "gap", id: this.nextId++, atSec: startSec, seconds, reason });
  }

  // ---- wake lock ----

  private async acquireWakeLock(): Promise<void> {
    if (!("wakeLock" in navigator)) {
      this.wakeLockState = "unsupported";
      return;
    }
    try {
      this.wakeLock = await navigator.wakeLock.request("screen");
      this.wakeLockState = "on";
      this.wakeLock.addEventListener("release", () => {
        this.wakeLockState = "off";
        this.emitDiagnostics();
      });
    } catch {
      this.wakeLockState = "off";
    }
  }

  private onVisibility = (): void => {
    if (document.visibilityState === "visible" && !this.stopping && this.wakeLockState !== "on") {
      void this.acquireWakeLock().then(() => this.emitDiagnostics());
    }
  };

  // ---- shared ----

  private teardown(): void {
    if (this.stallTimer) clearInterval(this.stallTimer);
    this.stallTimer = null;
    document.removeEventListener("visibilitychange", this.onVisibility);
    void this.wakeLock?.release().catch(() => undefined);
    this.wakeLock = null;
    this.stopAudio();
  }

  private emitDiagnostics(): void {
    this.cb.onDiagnostics({
      lastLagMs: this.lags.length ? this.lags[this.lags.length - 1] : null,
      medianLagMs: median(this.lags),
      maxLagMs: this.lags.length ? Math.max(...this.lags) : null,
      reconnects: this.reconnects,
      level: this.level,
      inputSampleRate: this.ctx?.sampleRate ?? null,
      audioState: this.ctx?.state ?? "closed",
      wakeLock: this.wakeLockState,
    });
  }
}

// Error names only; messages from the platform could echo request details.
function errorName(err: unknown): string {
  return err instanceof Error ? err.name : "unknown";
}
