import { describe, expect, it } from "vitest";
import { shouldPromptSilence, silentSeconds } from "@/lib/capture/silence";

const MIN = 60_000;

describe("shouldPromptSilence", () => {
  it("prompts after a minute without speech while recording", () => {
    expect(shouldPromptSilence({ live: true, lastSpeechAt: 0, snoozedUntil: 0 }, 59_999, MIN)).toBe(false);
    expect(shouldPromptSilence({ live: true, lastSpeechAt: 0, snoozedUntil: 0 }, 60_000, MIN)).toBe(true);
  });
  it("never prompts when not recording live", () => {
    expect(shouldPromptSilence({ live: false, lastSpeechAt: 0, snoozedUntil: 0 }, 10 * MIN, MIN)).toBe(false);
  });
  it("stays quiet while snoozed, then asks again", () => {
    const s = { live: true, lastSpeechAt: 0, snoozedUntil: 3 * MIN };
    expect(shouldPromptSilence(s, 2 * MIN, MIN)).toBe(false);
    expect(shouldPromptSilence(s, 3 * MIN, MIN)).toBe(true);
  });
  it("resets when someone speaks", () => {
    expect(shouldPromptSilence({ live: true, lastSpeechAt: 90_000, snoozedUntil: 0 }, 120_000, MIN)).toBe(false);
  });
  it("counts whole seconds", () => {
    expect(silentSeconds(0, 61_900)).toBe(61);
    expect(silentSeconds(5_000, 1_000)).toBe(0);
  });
});
