import type { NextConfig } from "next";

// config.yaml is read at runtime, so it must ship with every server route.
const withConfig = ["./config.yaml"];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/": withConfig,
    "/api/session": withConfig,
    "/api/stt/token": withConfig,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
