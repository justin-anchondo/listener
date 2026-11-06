import type { NextConfig } from "next";

// config.yaml is read at runtime, so it must ship with every server route.
const withConfig = ["./config.yaml"];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/": withConfig,
    "/**": withConfig,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          // Camera is for scanning a computer's sign in QR code on /pair; this site only.
          { key: "Permissions-Policy", value: "microphone=(self), camera=(self), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
