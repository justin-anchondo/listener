import { describe, expect, it } from "vitest";
import { isStalled, median, reconnectDelayMs, transcriptLagMs } from "@/lib/stt/timing";

describe("timing", () => {
  it("measures transcript lag behind sent audio", () => {
    expect(transcriptLagMs(12.5, 11.7)).toBe(800);
    expect(transcriptLagMs(10, 10.2)).toBe(0);
  });

  it("follows the backoff schedule and stops after max attempts", () => {
    const schedule = [500, 1000, 2000];
    expect(reconnectDelayMs(0, 5, schedule)).toBe(500);
    expect(reconnectDelayMs(2, 5, schedule)).toBe(2000);
    expect(reconnectDelayMs(4, 5, schedule)).toBe(2000);
    expect(reconnectDelayMs(5, 5, schedule)).toBeNull();
  });

  it("detects a stalled mic after the configured window", () => {
    expect(isStalled(0, 10_000, 10)).toBe(false);
    expect(isStalled(0, 10_001, 10)).toBe(true);
  });

  it("computes the median", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(3);
  });
});
