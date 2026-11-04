import type { NextConfig } from "next";
import { loadConfig } from "./src/lib/config";
import { originOf, securityHeaders } from "./src/lib/policy/transport";
import { DEEPGRAM_LISTEN_URL } from "./src/lib/stt/listen-url";

// config.yaml is read at runtime, so it must ship with every server route.
const withConfig = ["./config.yaml"];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/": withConfig,
    "/**": withConfig,
  },
  async headers() {
    const headers = securityHeaders({
      dev: process.env.NODE_ENV !== "production",
      hstsMaxAgeSeconds: loadConfig().security.hsts_max_age_seconds,
      connectOrigins: [originOf(DEEPGRAM_LISTEN_URL)],
    });
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
