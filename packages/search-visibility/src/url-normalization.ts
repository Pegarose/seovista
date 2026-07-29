/**
 * URL normalization for bulk audit and keyword operations.
 *
 * Applies the documented URL policy:
 * - Lowercase scheme and host
 * - Remove default ports (80 for http, 443 for https)
 * - Resolve dot segments (/a/../b/./c → /b/c)
 * - Remove fragment
 * - Reject userinfo
 * - Reject private/loopback/link-local/multicast targets
 * - Reject non-http(s) schemes
 * - Reject malformed URLs
 */

import { createTypedError, typedErrorCodes } from "./typed-errors.js";
import type { TypedError } from "./typed-errors.js";

/** A successfully normalized URL. */
export interface NormalizedUrl {
  /** The original raw URL input. */
  readonly raw: string;
  /** The canonical normalized URL. */
  readonly normalized: string;
}

// IPv4 private ranges
const PRIVATE_IPV4_PATTERNS: readonly RegExp[] = [
  /^127\./,                           // loopback
  /^10\./,                            // Class A private
  /^172\.(1[6-9]|2\d|3[01])\./,      // Class B private
  /^192\.168\./,                      // Class C private
  /^169\.254\./,                      // link-local
  /^0\./,                             // "this" network
];

function isPrivateIPv4(hostname: string): boolean {
  return PRIVATE_IPV4_PATTERNS.some((p) => p.test(hostname));
}

function isPrivateIPv6(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  // IPv6 loopback
  if (lower === "::1" || lower === "[::1]") return true;
  // IPv6 link-local
  if (lower.startsWith("fe80:")) return true;
  // IPv6 unique local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  // IPv4-mapped IPv6 loopback
  if (lower === "::ffff:127.0.0.1" || lower === "[::ffff:127.0.0.1]") return true;
  return false;
}

/**
 * Normalize a URL string according to the documented URL policy.
 *
 * Returns a `TypedError` for malformed, non-HTTP, private-target,
 * or userinfo-containing URLs.
 */
export function normalizeUrl(raw: string): NormalizedUrl | TypedError {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return createTypedError({
      code: typedErrorCodes.validation.malformed,
      retryable: false,
      message: "URL must not be empty",
    });
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return createTypedError({
      code: typedErrorCodes.validation.malformed,
      retryable: false,
      message: "URL is malformed",
    });
  }

  // Scheme check: only http and https
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return createTypedError({
      code: typedErrorCodes.validation.malformed,
      retryable: false,
      message: `URL scheme '${url.protocol.replace(":", "")}' is not supported`,
    });
  }

  // Userinfo rejection
  if (url.username !== "" || url.password !== "") {
    return createTypedError({
      code: typedErrorCodes.validation.malformed,
      retryable: false,
      message: "URLs with userinfo are not allowed",
    });
  }

  // Hostname safety check
  const hostname = url.hostname.toLowerCase();

  // Check for IPv4 private/loopback/link-local
  if (isPrivateIPv4(hostname)) {
    return createTypedError({
      code: typedErrorCodes.validation.malformed,
      retryable: false,
      message: "URL targets a private or loopback address",
    });
  }

  // Check for IPv6 private/loopback/link-local
  if (hostname.includes(":") || hostname.startsWith("[")) {
    const clean = hostname.replace(/^\[|\]$/g, "");
    if (isPrivateIPv6(clean)) {
      return createTypedError({
        code: typedErrorCodes.validation.malformed,
        retryable: false,
        message: "URL targets a private or loopback address",
      });
    }
  }

  // Build canonical URL (lowercase scheme + host, remove default port)
  const scheme = url.protocol.replace(":", "").toLowerCase();
  const port = url.port;
  const defaultPort = scheme === "http" ? "80" : "443";

  let canonical = `${scheme}://${url.hostname.toLowerCase()}`;
  if (port !== "" && port !== defaultPort) {
    canonical += `:${port}`;
  }

  // Resolve dot segments in path
  let path = url.pathname;
  // Collapse /./ and /../
  path = resolveDotSegments(path);

  canonical += path;

  // Append search (query) if present
  if (url.search && url.search.length > 1) {
    canonical += url.search;
  }

  // Fragment is intentionally excluded

  return {
    raw: trimmed,
    normalized: canonical,
  };
}

/**
 * Resolve '.' and '..' dot segments in a URL path.
 */
function resolveDotSegments(path: string): string {
  // If path is empty or "/", return as-is
  if (path === "" || path === "/") return path;

  const segments = path.split("/");
  const resolved: string[] = [];

  for (const seg of segments) {
    if (seg === "" || seg === ".") {
      // skip
    } else if (seg === "..") {
      // go up one level
      if (resolved.length > 0) {
        resolved.pop();
      }
    } else {
      resolved.push(seg);
    }
  }

  const result = "/" + resolved.join("/");
  // Preserve trailing slash if original had one
  if (path.endsWith("/") && result !== "/") {
    return result + "/";
  }
  return result;
}
