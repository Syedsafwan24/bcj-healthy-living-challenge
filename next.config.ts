import type { NextConfig } from "next";

/**
 * Security headers — build specification section 11.
 *
 * Strict-Transport-Security, X-Content-Type-Options, X-Frame-Options,
 * Referrer-Policy and a Content-Security-Policy without `unsafe-inline`.
 * /admin also sends X-Robots-Tag: noindex.
 *
 * The CSP nonce is issued per request in `src/middleware.ts`; this file
 * carries the headers that do not vary by request.
 */

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2", "exceljs"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // Admin screens carry health data and corrections. Keep them out of
        // search indexes entirely.
        source: "/admin/:path*",
        headers: [
          ...securityHeaders,
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
