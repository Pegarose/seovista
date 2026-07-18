/**
 * Trusted site configuration.
 * SITE_URL comes from the build environment. When unset, canonical/og:url use
 * relative paths so crawlers resolve them at request time.
 */
const rawSiteUrl = (import.meta.env.VITE_SITE_URL ?? "").trim();

export const SITE_URL = rawSiteUrl.replace(/\/$/, "");

export const SITE_NAME = "SeoVista";
export const SITE_TAGLINE = "Editorial intelligence for search visibility";
export const SITE_DESCRIPTION =
  "SeoVista is an editorial intelligence lab focused on Generative Engine Optimization, traditional SEO, and digital authority.";

/**
 * Build a canonical / og:url value for a route path. Always ends with a
 * trailing slash to match the site's public URL contract. When SITE_URL is
 * unset, returns a relative path — crawlers resolve it against the host.
 */
export function canonicalFor(path: string): string {
  const normalized = path === "/" ? "/" : `/${path.replace(/^\/+|\/+$/g, "")}/`;
  return SITE_URL ? `${SITE_URL}${normalized}` : normalized;
}

export const PUBLIC_ROUTES: readonly { path: string; label: string }[] = [
  { path: "/", label: "Home" },
  { path: "/geo/", label: "GEO" },
  { path: "/seo/", label: "SEO" },
  { path: "/digital-authority/", label: "Digital Authority" },
  { path: "/tools/", label: "Tools" },
  { path: "/insights/", label: "Insights" },
  { path: "/about/", label: "About" },
  { path: "/contact/", label: "Contact" },
];

export const LEGAL_ROUTES: readonly { path: string; label: string }[] = [
  { path: "/privacy/", label: "Privacy" },
  { path: "/cookies/", label: "Cookies" },
  { path: "/terms/", label: "Terms" },
];
