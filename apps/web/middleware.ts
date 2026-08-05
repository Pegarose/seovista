import { NextResponse, type NextRequest } from "next/server";

const APPROVED_FINAL_PATHS = new Set([
  "/geo/",
  "/seo/",
  "/digital-authority/",
  "/tools/",
  "/tools/geo-readiness-checker/",
  "/tools/schema-checker/",
  "/tools/ai-crawler-checker/",
  "/tools/serp-preview/",
  "/tools/keyword-rank-checker/",
  "/tools/schema-truth-check/",
  "/tools/render-parity-diff/",
  "/tools/attribution-trace/",
  "/about/",
  "/contact/",
  "/insights/",
  "/privacy/",
  "/cookies/",
  "/terms/",
]);

const APPROVED_DYNAMIC_PREFIXES = [
  "/tools/geo-readiness-checker/result/",
  "/tools/schema-checker/result/",
  "/tools/ai-crawler-checker/result/",
  "/tools/keyword-rank-checker/result/",
  "/tools/schema-truth-check/result/",
  "/tools/render-parity-diff/result/",
  "/tools/attribution-trace/result/",
];

const DEVELOPMENT_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const LOCAL_SERVER_PORTS = new Set(["3200"]);

const NON_PAGE_PATHS = [
  "/_next/",
  "/api/",
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/feed.xml",
  "/manifest.webmanifest",
  "/icon.svg",
];

function trustedOrigin(): string {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://seovista.com";
  const siteUrl = new URL(configuredSiteUrl);

  if (siteUrl.protocol !== "https:" || siteUrl.username || siteUrl.password || siteUrl.port) {
    throw new Error("NEXT_PUBLIC_SITE_URL must be a trusted HTTPS origin.");
  }

  return siteUrl.origin;
}

function isNonPagePath(pathname: string): boolean {
  return NON_PAGE_PATHS.some((path) => pathname === path || pathname.startsWith(path));
}

function isApprovedDynamicPath(pathname: string): boolean {
  return APPROVED_DYNAMIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function canonicalPath(pathname: string): string | undefined {
  const lowercasePathname = pathname.toLowerCase();
  const withTrailingSlash = lowercasePathname.endsWith("/")
    ? lowercasePathname
    : `${lowercasePathname}/`;

  return APPROVED_FINAL_PATHS.has(withTrailingSlash) ? withTrailingSlash : undefined;
}

function isDevelopmentRequest(request: NextRequest): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const hostname = request.nextUrl.hostname.toLowerCase();
  if (DEVELOPMENT_HOSTS.has(hostname)) return true;
  // Production builds serving behind localhost-style infra (e.g. Docker bridge)
  // are treated as non-public so canonical redirects stay host-relative.
  return LOCAL_SERVER_PORTS.has(request.nextUrl.port);
}

function isApprovedFinalPath(pathname: string, canonical: string): boolean {
  return pathname === canonical;
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-seovista-pathname", pathname);

  let response: NextResponse | undefined;
  
  if (pathname.startsWith("/admin")) {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  } else if (pathname === "/" || isNonPagePath(pathname)) {
    response = NextResponse.next();
  } else if (isApprovedDynamicPath(pathname)) {
    response = NextResponse.next();
  } else if (isDevelopmentRequest(request)) {
    // Local/dev traffic: never send users to the production origin. If the
    // path is canonical, do nothing and let the router handle it.
    response = NextResponse.next();
  } else {
    const canonical = canonicalPath(pathname);
    if (!canonical || isApprovedFinalPath(pathname, canonical)) {
      response = NextResponse.next();
    } else {
      // Must not fall into the next section as a response, so redirect immediately
      response = NextResponse.redirect(new URL(canonical, trustedOrigin()), 301);
    }
  }

  // Enforce private headers for the audit result route
  if (pathname.startsWith("/tools/geo-readiness-checker/result/")) {
    // If it's a redirect, we shouldn't necessarily modify headers, but this path isn't in canonical anyway.
    // Ensure we handle it if Next.js passes through.
    response = response ?? NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response ?? NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
