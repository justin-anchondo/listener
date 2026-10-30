import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { captureSettings, parseConfig } from "@/lib/config";
import { buildListenUrl, listenProtocols } from "@/lib/stt/listen-url";

const settings = captureSettings(parseConfig(readFileSync(path.join(__dirname, "../../config.yaml"), "utf8")));

describe("buildListenUrl", () => {
  const url = new URL(buildListenUrl(settings));

  it("targets the Deepgram streaming endpoint", () => {
    expect(`${url.protocol}//${url.host}${url.pathname}`).toBe("wss://api.deepgram.com/v1/listen");
  });

  it("opts out of the vendor model improvement program", () => {
    expect(url.searchParams.get("mip_opt_out")).toBe("true");
  });

  it("matches the PCM format the phone sends", () => {
    expect(url.searchParams.get("encoding")).toBe("linear16");
    expect(url.searchParams.get("sample_rate")).toBe(String(settings.capture.sample_rate_hz));
    expect(url.searchParams.get("channels")).toBe("1");
  });

  it("carries model and diarization from config", () => {
    expect(url.searchParams.get("model")).toBe(settings.stt.model);
    expect(url.searchParams.get("diarize")).toBe("true");
  });

  it("never puts a credential in the URL", () => {
    expect(url.search).not.toMatch(/token|key|auth/i);
  });
});

describe("listenProtocols", () => {
  it("passes the temporary token as a bearer subprotocol", () => {
    expect(listenProtocols("jwt")).toEqual(["bearer", "jwt"]);
  });
});
