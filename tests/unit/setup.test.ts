import { describe, expect, it } from "vitest";
import { missingSettings } from "@/lib/setup";

describe("missingSettings", () => {
  it("lists missing names only", () => {
    expect(missingSettings({ DATABASE_URL: "postgres://secret", DEEPGRAM_API_KEY: "k" })).toEqual([
      "LISTENER_MASTER_KEY",
      "LISTENER_ACCESS_CODE",
      "CRON_SECRET",
    ]);
  });

  it("is empty when everything is set", () => {
    const all = Object.fromEntries(
      ["DATABASE_URL", "LISTENER_MASTER_KEY", "LISTENER_ACCESS_CODE", "DEEPGRAM_API_KEY", "CRON_SECRET"].map((k) => [k, "x"]),
    );
    expect(missingSettings(all)).toEqual([]);
  });
});
