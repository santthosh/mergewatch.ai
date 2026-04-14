import { NextRequest, NextResponse } from "next/server";

/**
 * Canonical production host. Any request that does not arrive on this
 * host is treated as non-production — Amplify preview branches,
 * development.mergewatch.ai, Lambda function URLs, or ad-hoc previews.
 */
const CANONICAL_HOST = "mergewatch.ai";

/**
 * Middleware handles two host-level concerns that can't live in
 * next.config.js headers():
 *
 * 1. 301 www.mergewatch.ai → mergewatch.ai so the duplicate is removed
 *    from Google's index instead of just downgraded via canonical tag.
 *
 * 2. X-Robots-Tag: noindex on every non-canonical host. Without this,
 *    development.mergewatch.ai competes with production in the index,
 *    and preview deploys can leak into organic search. The production
 *    host is explicitly allowed; everything else is blocked from
 *    indexing regardless of canonical tags on the page.
 */
export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";

  if (host.startsWith("www.")) {
    const url = req.nextUrl.clone();
    // Clear the inbound port before rewriting the host. req.nextUrl.clone()
    // preserves the internal Lambda port (3000 on Amplify SSR), and the
    // URL API keeps `port` and `host` as independent properties — setting
    // `host` alone does not strip the port, so the Location header would
    // otherwise read https://mergewatch.ai:3000/ and break canonical
    // consolidation for Googlebot.
    url.port = "";
    url.host = host.slice(4);
    url.protocol = "https";
    return NextResponse.redirect(url, 301);
  }

  const res = NextResponse.next();
  if (host !== CANONICAL_HOST) {
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return res;
}

export const config = {
  // Skip static assets and Next internals so middleware only runs on
  // real page navigations and API routes.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
