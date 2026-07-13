import { NextResponse, type NextRequest } from "next/server";

const APPROVED_FINAL_PATHS = new Set([
  "/geo/",
  "/seo/",
  "/digital-authority/",
  "/tools/",
  "/tools/geo-readiness-checker/",
  "/about/",
  "/contact/",
  "/insights/",
  "/privacy/",
  "/cookies/",
  "/terms/",
]);

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

function canonicalPath(pathname: string): string | undefined {
  const lowercasePathname = pathname.toLowerCase();
  const withTrailingSlash = lowercasePathname.endsWith("/")
    ? lowercasePathname
    : `${lowercasePathname}/`;

  return APPROVED_FINAL_PATHS.has(withTrailingSlash) ? withTrailingSlash : undefined;
}

function isApprovedFinalPath(pathname: string, canonical: string): boolean {
  return pathname === canonical;
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (pathname === "/" || isNonPagePath(pathname)) {
    return NextResponse.next();
  }

  const canonical = canonicalPath(pathname);
  if (!canonical || isApprovedFinalPath(pathname, canonical)) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL(canonical, trustedOrigin()), 301);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
