import type { NextConfig } from "next";

const securityHeaders = [
  // Only this site may frame the app (clickjacking protection). No connect-src
  // here on purpose: Simli and OpenAI media/signaling hosts vary.
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "Permissions-Policy", value: "microphone=(self), camera=()" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
