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
    session_max_hours: z.number().positive(),
    session_refresh_seconds: z.number().int().positive(),
    passkey_challenge_seconds: z.number().int().positive(),
  }),
  access_gate: z.object({
    min_code_length: z.number().int().min(8),
  }),
  storage: z.object({
    segment_flush_seconds: z.number().positive(),
    max_segments_per_post: z.number().int().positive(),
    max_segment_chars: z.number().int().positive(),
    max_name_chars: z.number().int().positive(),
    max_brief_chars: z.number().int().positive(),
    max_logo_bytes: z.number().int().positive(),
    logo_pixels: z.number().int().positive(),
    recent_meetings: z.number().int().positive(),
    merge_window_hours: z.number().positive(),
  }),
  capture: z.object({
    sample_rate_hz: z.number().int().positive(),
    chunk_ms: z.number().int().positive(),
    merge_gap_seconds: z.number().nonnegative(),
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
    post_request_timeout_seconds: z.number().positive(),
    post_effort: z.enum(["low", "medium", "high", "xhigh", "max"]),
    post_max_tokens: z.number().int().positive(),
    max_list_items: z.number().int().positive(),
    max_action_items: z.number().int().positive(),
    max_item_chars: z.number().int().positive(),
    transcript_merge_gap_seconds: z.number().nonnegative(),
    max_brief_updates: z.number().int().nonnegative(),
    brief_amendments_in_prompt: z.number().int().nonnegative(),
    max_free_form_tags: z.number().int().nonnegative(),
    live_effort: z.enum(["low", "medium", "high"]),
    live_max_tokens: z.number().int().positive(),
    live_request_timeout_seconds: z.number().positive(),
    live_min_gap_seconds: z.number().nonnegative(),
    live_recent_summaries: z.number().int().nonnegative(),
    live_open_items: z.number().int().nonnegative(),
    live_card_chars: z.number().int().positive(),
    live_max_window_chars: z.number().int().positive(),
    follow_poll_seconds: z.number().positive(),
    follow_active_hours: z.number().positive(),
    follow_max_segments: z.number().int().positive(),
  }),
  recall: z.object({
    max_context_tokens: z.number().int().positive(),
    recent_summaries: z.number().int().positive(),
    effort: z.enum(["low", "medium", "high", "xhigh", "max"]),
    max_tokens: z.number().int().positive(),
    request_timeout_seconds: z.number().positive(),
    max_question_chars: z.number().int().positive(),
    max_items: z.number().int().positive(),
  }),
  owner: z.object({ names: z.array(z.string()) }),
  tags: z.array(z.string()),
  templates: z.record(z.string(), z.object({ watch_for: z.array(z.string()) })),
});

export type Config = z.infer<typeof configSchema>;

/** Settings the browser capture screen needs. Contains no secrets. */
export type CaptureSettings = Pick<Config, "capture" | "stt"> & {
  storage: Pick<Config["storage"], "segment_flush_seconds" | "max_segments_per_post">;
  templates: { key: string; name: string }[];
  live: { interval_seconds: number; min_gap_seconds: number; window_minutes: number; max_suggestions: number; follow_poll_seconds: number };
  ownerNames: string[];
};

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
  return {
    capture: config.capture,
    stt: config.stt,
    storage: {
      segment_flush_seconds: config.storage.segment_flush_seconds,
      max_segments_per_post: config.storage.max_segments_per_post,
    },
    templates: Object.keys(config.templates).map((key) => ({ key, name: key })),
    live: {
      interval_seconds: config.assist.live_interval_seconds,
      min_gap_seconds: config.assist.live_min_gap_seconds,
      window_minutes: config.assist.live_transcript_window_minutes,
      max_suggestions: config.assist.live_max_suggestions,
      follow_poll_seconds: config.assist.follow_poll_seconds,
    },
    ownerNames: config.owner.names,
  };
}
