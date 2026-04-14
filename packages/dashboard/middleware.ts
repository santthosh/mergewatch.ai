import { NextRequest, NextResponse } from "next/server";

/**
 * 301-redirect www.mergewatch.ai to mergewatch.ai so crawlers and users
 * land on the canonical apex host. The canonical <link> tag mitigates
 * duplicate-content ranking dilution, but a real redirect is the only
 * thing that removes the duplicate from the index entirely.
 */
export function middleware(req: NextRequest) {
  const host = req.headers.get("host");
  if (host?.startsWith("www.")) {
    const url = req.nextUrl.clone();
    url.host = host.slice(4);
    url.protocol = "https";
    return NextResponse.redirect(url, 301);
  }
  return NextResponse.next();
}

export const config = {
  // Skip static assets and Next internals so the redirect only fires on
  // real page navigations.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
