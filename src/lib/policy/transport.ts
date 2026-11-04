// Transport security rules (SPEC 6.2 "TLS everywhere"): the browser headers
// every response carries, and how the server's database connection checks
// who it is talking to. Pure functions; callers pass in config and env.

export type Header = { key: string; value: string };

export type HeaderOptions = {
  /** next dev needs eval for fast refresh; never true in a production build. */
  dev: boolean;
  /** Strict-Transport-Security max-age, from config.yaml security. */
  hstsMaxAgeSeconds: number;
  /** Extra origins the browser may open connections to (the transcription socket). */
  connectOrigins: string[];
};

/** Origin of a URL ("wss://api.example.com/v1/x" -> "wss://api.example.com"). */
export function originOf(url: string): string {
  return new URL(url).origin;
}

export function contentSecurityPolicy(opts: Pick<HeaderOptions, "dev" | "connectOrigins">): string {
  // Next.js inlines its own boot scripts and styles, so 'unsafe-inline' stays
  // for those; what this blocks is loading code or sending data anywhere else.
  const scripts = ["'self'", "'unsafe-inline'", ...(opts.dev ? ["'unsafe-eval'"] : [])];
  const connect = ["'self'", ...opts.connectOrigins, ...(opts.dev ? ["ws:"] : [])];
  return [
    "default-src 'self'",
    `script-src ${scripts.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connect.join(" ")}`,
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(opts.dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function securityHeaders(opts: HeaderOptions): Header[] {
  if (!Number.isInteger(opts.hstsMaxAgeSeconds) || opts.hstsMaxAgeSeconds <= 0) {
    throw new Error("hsts max age must be a positive integer");
  }
  for (const origin of opts.connectOrigins) {
    if (!/^(https|wss):\/\/[^/\s;]+$/.test(origin)) throw new Error("connect origins must be https or wss origins");
  }
  const headers: Header[] = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(opts) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" },
  ];
  // Browsers ignore HSTS over plain http, and sending it from localhost would
  // pin http://localhost to https for every local project.
  if (!opts.dev) {
    headers.push({ key: "Strict-Transport-Security", value: `max-age=${opts.hstsMaxAgeSeconds}; includeSubDomains` });
  }
  return headers;
}

/** postgres.js `ssl` option: off for a local database, otherwise TLS. */
export type DbTls = false | "require" | { ca: string; rejectUnauthorized: true };

export function isLocalDatabase(url: string): boolean {
  return /@(localhost|127\.0\.0\.1)[:/]/.test(url);
}

/**
 * With the provider's CA certificate, the connection is encrypted AND the
 * server must prove it is the real database (certificate chain and host name).
 * Without it, the connection is still encrypted but the server isn't checked.
 */
export function databaseTls(url: string, caCert: string | undefined): DbTls {
  if (isLocalDatabase(url)) return false;
  const ca = caCert?.trim();
  if (!ca) return "require";
  if (!ca.includes("-----BEGIN CERTIFICATE-----")) throw new Error("DATABASE_CA_CERT is not a PEM certificate");
  return { ca: ca.replace(/\\n/g, "\n"), rejectUnauthorized: true };
}
