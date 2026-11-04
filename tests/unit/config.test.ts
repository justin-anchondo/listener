import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import { captureSettings, parseConfig } from "@/lib/config";

const raw = readFileSync(path.join(__dirname, "../../config.yaml"), "utf8");

function withOverride(mutate: (c: Record<string, any>) => void): string {
  const c = parse(raw);
  mutate(c);
  return stringify(c);
}

describe("config", () => {
  it("parses the checked in config.yaml", () => {
    const config = parseConfig(raw);
    expect(config.retention.transcript_days).toBe(30);
    expect(config.stt.mip_opt_out).toBe(true);
  });

  it("refuses to load if audio storage is turned on", () => {
    expect(() => parseConfig(withOverride((c) => (c.retention.audio_store = true)))).toThrow();
  });

  it("refuses to load if sign up is enabled", () => {
    expect(() => parseConfig(withOverride((c) => (c.security.signup_enabled = true)))).toThrow();
  });

  it("refuses a token TTL above Deepgram's maximum", () => {
    expect(() => parseConfig(withOverride((c) => (c.stt.token_ttl_seconds = 7200)))).toThrow();
  });

  it("rejects missing sections", () => {
    expect(() => parseConfig(withOverride((c) => delete c.capture))).toThrow();
  });

  it("exposes only capture, stt, and live timing settings to the browser", () => {
    const config = parseConfig(raw);
    const s = captureSettings(config);
    expect(Object.keys(s).sort()).toEqual(["capture", "live", "ownerNames", "storage", "stt", "templates"]);
    expect(Object.keys(s.live).sort()).toEqual(["interval_seconds", "max_suggestions", "min_gap_seconds", "window_minutes"]);
    const sent = JSON.stringify(s);
    expect(sent).not.toContain(config.models.live);
    expect(sent).not.toContain(config.models.post);
  });
});
