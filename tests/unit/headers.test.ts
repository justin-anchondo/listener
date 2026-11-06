import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("security headers", () => {
  it("allows the microphone and camera for this site only, and nothing else", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/:path*")!.headers;
    const policy = all.find((h) => h.key === "Permissions-Policy")!.value;
    expect(policy).toBe("microphone=(self), camera=(self), geolocation=()");
    expect(all.find((h) => h.key === "X-Frame-Options")!.value).toBe("DENY");
    expect(all.find((h) => h.key === "Referrer-Policy")!.value).toBe("no-referrer");
  });
});
