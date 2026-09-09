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
  /**
   * The registration email attaches the 90-day handout and the diet plan,
   * read from src/assets at run time. Next traces files it can see being
   * required, and a readFileSync built from process.cwd() and a string is not
   * something it can follow — so without naming them here a build can ship
   * without the PDFs.
   *
   * It fails quietly if it does: lib/email.ts logs and sends the email
   * anyway, because a missing attachment must never stop a registration ID
   * arriving. Quiet is exactly why this is stated rather than assumed.
   */
  outputFileTracingIncludes: {
    "/**": ["./src/assets/*.pdf"],
  },
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
