import { describe, expect, it } from "vitest";
import { describeCaptureError, micErrorCode, tokenErrorCode } from "@/lib/capture/errors";

function named(name: string): Error {
  const e = new Error("x");
  e.name = name;
  return e;
}

describe("capture error codes", () => {
  it("maps microphone failures", () => {
    expect(micErrorCode(named("NotAllowedError"))).toBe("mic_denied");
    expect(micErrorCode(named("NotFoundError"))).toBe("mic_missing");
    expect(micErrorCode(named("NotReadableError"))).toBe("mic_busy");
    expect(micErrorCode("weird")).toBe("mic_failed");
  });

  it("maps token route failures, including Deepgram's status", () => {
    expect(tokenErrorCode(401)).toBe("session");
    expect(tokenErrorCode(503)).toBe("token_not_configured");
    expect(tokenErrorCode(502, 403)).toBe("token_upstream_403");
    expect(tokenErrorCode(502)).toBe("token_upstream");
    expect(tokenErrorCode(500)).toBe("token_http_500");
  });

  it("gives specific help for known codes", () => {
    expect(describeCaptureError("token_not_configured")).toMatch(/DEEPGRAM_API_KEY/);
    expect(describeCaptureError("token_upstream_401")).toMatch(/rejected/);
    expect(describeCaptureError("mic_denied")).toMatch(/permission/);
  });

  it("shows the code for anything unknown instead of a bare catch all", () => {
    expect(describeCaptureError("token_http_418")).toBe("Something went wrong (token_http_418).");
    expect(describeCaptureError(undefined)).toBe("Something went wrong (unknown).");
  });
});
