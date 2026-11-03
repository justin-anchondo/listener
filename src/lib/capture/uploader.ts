// Sends final transcript segments to the server in batches. Unsent segments
// live in memory only (SPEC 3.4) and are retried on the next flush. Retries
// are safe because the server ignores a seq it already has.

export type UploadSegment = { seq: number; speaker: number | null; startMs: number; endMs: number; text: string };

export type UploaderState = { pending: number; saved: number; failing: boolean; unauthorized: boolean };

export type UploaderOptions = {
  clientId: string;
  meetingId: string;
  maxPerPost: number;
  fetchImpl?: typeof fetch;
  onState?: (s: UploaderState) => void;
};

export class SegmentUploader {
  private queue: UploadSegment[] = [];
  private nextSeq = 0;
  private saved = 0;
  private failing = false;
  private unauthorized = false;
  private inFlight: Promise<void> | null = null;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: UploaderOptions) {
    this.fetchImpl = opts.fetchImpl ?? ((...args) => fetch(...args));
  }

  private get base(): string {
    return `/api/clients/${this.opts.clientId}/meetings/${this.opts.meetingId}`;
  }

  add(segment: Omit<UploadSegment, "seq">): void {
    this.queue.push({ ...segment, seq: this.nextSeq++ });
    this.emit();
  }

  /** Sends one batch. Concurrent calls share the request in progress. */
  flush(): Promise<void> {
    if (!this.inFlight) {
      this.inFlight = this.send().finally(() => {
        this.inFlight = null;
      });
    }
    return this.inFlight;
  }

  private async send(): Promise<void> {
    if (this.queue.length === 0) return;
    const batch = this.queue.slice(0, this.opts.maxPerPost);
    try {
      const res = await this.fetchImpl(`${this.base}/segments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segments: batch }),
      });
      if (res.ok) {
        const sent = new Set(batch.map((s) => s.seq));
        this.queue = this.queue.filter((s) => !sent.has(s.seq));
        this.saved += batch.length;
        this.failing = false;
        this.unauthorized = false;
      } else {
        this.failing = true;
        this.unauthorized = res.status === 401;
      }
    } catch {
      this.failing = true;
    }
    this.emit();
  }

  /** Flushes until the queue is empty or attempts run out, then marks the meeting ended. */
  async finish(attempts = 5, retryMs = 1000): Promise<boolean> {
    for (let i = 0; i < attempts && this.queue.length > 0; i++) {
      await this.flush();
      while (this.queue.length > 0 && !this.failing) await this.flush();
      if (this.queue.length > 0) await new Promise((r) => setTimeout(r, retryMs));
    }
    try {
      const res = await this.fetchImpl(`${this.base}/end`, { method: "POST" });
      return res.ok && this.queue.length === 0;
    } catch {
      return false;
    }
  }

  state(): UploaderState {
    return { pending: this.queue.length, saved: this.saved, failing: this.failing, unauthorized: this.unauthorized };
  }

  private emit(): void {
    this.opts.onState?.(this.state());
  }
}
