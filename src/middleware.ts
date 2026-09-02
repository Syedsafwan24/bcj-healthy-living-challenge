import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware — build specification sections 2.3 and 11.
 *
 * Three jobs:
 *
 *   1. A per-request CSP nonce, so the policy carries no `unsafe-inline`.
 *   2. The optional /admin IP allowlist. Blank disables the check, which is
 *      the default: it works well for an office and badly for volunteers
 *      working from home.
 *   3. A cheap cookie presence check on protected routes, so a signed-out
 *      visitor is redirected without a database round trip.
 *
 * The cookie check here is a redirect, not an authorisation decision. Every
 * page and action re-derives the session from the database through
 * `requireParticipant` or `requireAdmin`. A forged cookie gets past this file
 * and no further.
 */

const PARTICIPANT_COOKIE = "bcj_participant_session";
const ADMIN_COOKIE = "bcj_admin_session";

/** Admin routes reachable without an admin session. */
const ADMIN_PUBLIC = ["/admin/login", "/admin/invite", "/admin/recovery"];

function isAdminPublic(pathname: string): boolean {
  return ADMIN_PUBLIC.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "";
}

function contentSecurityPolicy(nonce: string): string {
  const isDev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    // 'strict-dynamic' lets the nonced Next.js bootstrap load its own chunks.
    // In development the React refresh runtime needs eval.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${
      isDev ? "'unsafe-eval'" : ""
    }`.trim(),
    // Fonts are self-hosted by next/font, so no Google origins are needed.
    // Styles still need 'unsafe-inline': Next injects the stylesheet link and
    // Recharts writes inline style attributes, which this does not cover but
    // style-src-attr would. Kept narrow rather than opening script-src.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  /* ---- optional /admin IP allowlist ---- */
  if (pathname.startsWith("/admin")) {
    const allowlist = (process.env.ADMIN_IP_ALLOWLIST ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (allowlist.length > 0 && !allowlist.includes(clientIp(request))) {
      return new NextResponse("Not found", { status: 404 });
    }
  }

  /* ---- signed-out redirects ---- */
  if (pathname.startsWith("/app")) {
    if (!request.cookies.has(PARTICIPANT_COOKIE)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
  }

  if (pathname.startsWith("/admin") && !isAdminPublic(pathname)) {
    if (!request.cookies.has(ADMIN_COOKIE)) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
  }

  /* ---- CSP nonce ---- */
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and the favicon.
    {
      source: "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
