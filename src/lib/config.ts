import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";

const configSchema = z.object({
  retention: z.object({
    audio_store: z.literal(false), // CLAUDE.md rule 1: audio is never persisted
    transcript_days: z.number().int().positive(),
    unpinned_suggestion_days: z.number().int().positive(),
    audit_log_days: z.number().int().positive(),
    purge_cron_utc: z.string(),
  }),
  security: z.object({
    session_idle_minutes: z.number().int().positive(),
    signup_enabled: z.literal(false),
    cipher: z.literal("aes-256-gcm"),
  }),
  access_gate: z.object({
    min_code_length: z.number().int().min(8),
    session_hours: z.number().positive(),
  }),
  capture: z.object({
    sample_rate_hz: z.number().int().positive(),
    chunk_ms: z.number().int().positive(),
    echo_cancellation: z.boolean(),
    noise_suppression: z.boolean(),
    auto_gain_control: z.boolean(),
    target_latency_ms: z.number().int().positive(),
    stall_alert_seconds: z.number().positive(),
    reconnect_max_attempts: z.number().int().nonnegative(),
    reconnect_backoff_ms: z.array(z.number().int().nonnegative()).min(1),
  }),
  stt: z.object({
    vendor: z.literal("deepgram"),
    model: z.string(),
    diarize: z.boolean(),
    interim_results: z.boolean(),
    smart_format: z.boolean(),
    mip_opt_out: z.boolean(),
    language: z.string(),
    token_ttl_seconds: z.number().int().min(1).max(3600),
  }),
  models: z.object({ live: z.string(), post: z.string() }),
  assist: z.object({
    live_interval_seconds: z.number().positive(),
    live_max_suggestions: z.number().int().positive(),
    live_max_latency_ms: z.number().int().positive(),
    live_transcript_window_minutes: z.number().positive(),
    post_meeting_timeout_seconds: z.number().positive(),
    max_free_form_tags: z.number().int().nonnegative(),
  }),
  recall: z.object({
    max_context_tokens: z.number().int().positive(),
    recent_summaries: z.number().int().positive(),
  }),
  tags: z.array(z.string()),
  templates: z.record(z.string(), z.object({ watch_for: z.array(z.string()) })),
});

export type Config = z.infer<typeof configSchema>;

/** Settings the browser capture screen needs. Contains no secrets. */
export type CaptureSettings = Pick<Config, "capture" | "stt">;

export function parseConfig(text: string): Config {
  return configSchema.parse(parse(text));
}

let cached: Config | undefined;

export function loadConfig(): Config {
  if (!cached) {
    cached = parseConfig(readFileSync(path.join(process.cwd(), "config.yaml"), "utf8"));
  }
  return cached;
}

export function captureSettings(config: Config): CaptureSettings {
  return { capture: config.capture, stt: config.stt };
}
