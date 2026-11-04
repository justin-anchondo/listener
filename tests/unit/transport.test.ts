import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, databaseTls, isLocalDatabase, originOf, securityHeaders } from "@/lib/policy/transport";

const prod = { dev: false, hstsMaxAgeSeconds: 63072000, connectOrigins: ["wss://api.deepgram.com"] };
const byKey = (h: { key: string; value: string }[]) => Object.fromEntries(h.map((x) => [x.key, x.value]));

describe("security headers", () => {
  it("forces https and blocks framing in production", () => {
    const h = byKey(securityHeaders(prod));
    expect(h["Strict-Transport-Security"]).toBe("max-age=63072000; includeSubDomains");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("no-referrer");
    expect(h["Permissions-Policy"]).toContain("microphone=(self)");
  });

  it("limits where the browser may load code or send data", () => {
    const csp = byKey(securityHeaders(prod))["Content-Security-Policy"];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self' wss://api.deepgram.com");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/\*|https:(?!\/)|http:/);
  });

  it("only relaxes for local development", () => {
    const dev = securityHeaders({ ...prod, dev: true });
    expect(byKey(dev)["Strict-Transport-Security"]).toBeUndefined();
    expect(contentSecurityPolicy({ dev: true, connectOrigins: [] })).toContain("'unsafe-eval'");
  });

  it("rejects bad settings instead of sending a weak header", () => {
    expect(() => securityHeaders({ ...prod, hstsMaxAgeSeconds: 0 })).toThrow();
    expect(() => securityHeaders({ ...prod, hstsMaxAgeSeconds: 1.5 })).toThrow();
    for (const bad of ["*", "http://api.deepgram.com", "wss://a.com; script-src *", "wss://a.com/path"]) {
      expect(() => securityHeaders({ ...prod, connectOrigins: [bad] })).toThrow();
    }
  });

  it("derives the socket origin from the vendor URL", () => {
    expect(originOf("wss://api.deepgram.com/v1/listen?x=1")).toBe("wss://api.deepgram.com");
  });
});

describe("database TLS", () => {
  const remote = "postgres://listener_app:pw@aws-0-us-west-2.pooler.supabase.com:6543/postgres";
  const pem = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";

  it("skips TLS only for a local database", () => {
    expect(isLocalDatabase("postgres://u:p@localhost:5432/db")).toBe(true);
    expect(isLocalDatabase("postgres://u:p@127.0.0.1/db")).toBe(true);
    expect(isLocalDatabase(remote)).toBe(false);
    expect(isLocalDatabase("postgres://u:p@localhost.evil.com:5432/db")).toBe(false);
    expect(databaseTls("postgres://u:p@localhost:5432/db", pem)).toBe(false);
  });

  it("always encrypts a remote database", () => {
    expect(databaseTls(remote, undefined)).toBe("require");
    expect(databaseTls(remote, "  ")).toBe("require");
  });

  it("verifies the server when the CA certificate is set", () => {
    expect(databaseTls(remote, pem)).toEqual({ ca: pem, rejectUnauthorized: true });
    expect(databaseTls(remote, pem.replace(/\n/g, "\\n"))).toEqual({ ca: pem, rejectUnauthorized: true });
  });

  it("refuses a value that isn't a certificate rather than silently not verifying", () => {
    expect(() => databaseTls(remote, "not a cert")).toThrow();
  });
});
