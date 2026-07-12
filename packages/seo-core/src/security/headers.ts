export interface SecurityHeadersOptions {
  /**
   * Whether HSTS should be emitted. Default is `true` only when
   * `NODE_ENV === "production"`.
   */
  hsts?: boolean;
  /**
   * Explicit approved origins for connect-src, img-src, etc. The site's own
   * origin is always included via `'self'`.
   */
  approvedOrigins?: string[];
}

/**
 * Build a production Content-Security-Policy value.
 *
 * - `object-src 'none'` disables plugins/objects.
 * - `frame-ancestors 'none'` prevents clickjacking.
 * - No wildcard script sources and no `unsafe-eval`.
 */
export function buildCsp(options: SecurityHeadersOptions = {}): string {
  const approved = options.approvedOrigins ?? [];

  const directives = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${approved.length > 0 ? ` ${approved.join(" ")}` : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ];

  return directives.join("; ");
}

export function buildHsts(): string {
  // Durable max-age (1 year), subdomain policy, and preload inclusion.
  return "max-age=31536000; includeSubDomains; preload";
}

export interface SecurityHeader {
  key: string;
  value: string;
}

/**
 * Return the full production security header set for HTML responses.
 */
export function buildSecurityHeaders(
  options: SecurityHeadersOptions = {},
): SecurityHeader[] {
  const enableHsts =
    options.hsts ?? (typeof process !== "undefined" && process.env.NODE_ENV === "production");

  const headers: SecurityHeader[] = [
    { key: "Content-Security-Policy", value: buildCsp(options) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
  ];

  if (enableHsts) {
    headers.push({ key: "Strict-Transport-Security", value: buildHsts() });
  }

  return headers;
}

/**
 * Format headers for Next.js `headers` configuration.
 */
export function nextSecurityHeaders(options: SecurityHeadersOptions = {}): {
  source: string;
  headers: Array<{ key: string; value: string }>;
}[] {
  const headers = buildSecurityHeaders(options).map(({ key, value }) => ({
    key,
    value,
  }));

  return [
    {
      source: "/:path*",
      headers,
    },
  ];
}
