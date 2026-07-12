import {
  validateHostname,
  validateIpAddress,
  validateResolverResult,
  type AddressValidationResult,
} from "./address.js";

export const DEFAULT_ALLOWED_SCHEMES: readonly string[] = ["http:", "https:"];

export const DEFAULT_DENIED_PORTS: readonly number[] = [
  0, 22, 23, 25, 53, 110, 143, 445, 3306, 5432, 6379, 8086, 8088, 9092, 9200,
  9300, 11211,
];

export interface SsrfPolicy {
  allowedSchemes?: readonly string[];
  deniedPorts?: readonly number[];
  maxPort?: number;
  /**
   * Resolver used to validate the IP addresses a hostname resolves to. If
   * omitted, hostname literals and numeric IPs are still validated, but
   * ordinary hostnames are not resolved and therefore only scheme, port, and
   * hostname policy are applied.
   */
  // eslint-disable-next-line no-unused-vars
  resolver?: (hostname: string) => Promise<string[]> | string[];
}

export interface UrlValidationResult {
  safe: boolean;
  normalizedUrl?: string | undefined;
  hostname?: string | undefined;
  port?: number | undefined;
  reason?: string | undefined;
}

function normalizePort(port: number, scheme: string): number | undefined {
  if (scheme === "http:" && port === 80) return undefined;
  if (scheme === "https:" && port === 443) return undefined;
  return port;
}

export function normalizeUrl(raw: string): string | null {
  try {
    const url = new URL(raw);

    // Lowercase scheme and host per RFC.
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();

    // Remove default port.
    const port = normalizePort(
      Number(url.port) || (url.protocol === "https:" ? 443 : 80),
      url.protocol,
    );
    url.port = port === undefined ? "" : String(port);

    return url.href;
  } catch {
    return null;
  }
}

function isPortDenied(port: number, policy: SsrfPolicy): string | undefined {
  const maxPort = policy.maxPort ?? 65535;
  if (port < 1 || port > maxPort) {
    return `port ${port} is outside the allowed range 1-${maxPort}`;
  }

  const denied = policy.deniedPorts ?? DEFAULT_DENIED_PORTS;
  if (denied.includes(port)) {
    return `port ${port} is in the denied list`;
  }

  return undefined;
}

export async function validateUrl(
  raw: string,
  policy: SsrfPolicy = {},
): Promise<UrlValidationResult> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { safe: false, reason: "Malformed URL" };
  }

  const scheme = url.protocol.toLowerCase();
  const allowedSchemes = policy.allowedSchemes ?? DEFAULT_ALLOWED_SCHEMES;
  if (!allowedSchemes.includes(scheme)) {
    return { safe: false, reason: `Unsupported URL scheme ${scheme}` };
  }

  if (url.username !== "" || url.password !== "") {
    return { safe: false, reason: "URL contains credentials" };
  }

  const hostname = url.hostname.toLowerCase();
  const hostnameResult = validateHostname(hostname);
  if (!hostnameResult.safe) {
    return { safe: false, hostname, reason: hostnameResult.reason };
  }

  const port = Number(url.port) || (scheme === "https:" ? 443 : 80);
  const portReason = isPortDenied(port, policy);
  if (portReason) {
    return { safe: false, hostname, port, reason: portReason };
  }

  // If the hostname is a literal IP, validate it directly.
  let addressResult: AddressValidationResult | undefined;
  if (/^\[.*\]$/.test(hostname)) {
    const literal = hostname.slice(1, -1);
    addressResult = validateIpAddress(literal);
  } else if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    addressResult = validateIpAddress(hostname);
  } else if (policy.resolver) {
    const resolved = await policy.resolver(hostname);
    addressResult = validateResolverResult(resolved);
  }

  if (addressResult && !addressResult.safe) {
    return { safe: false, hostname, port, reason: addressResult.reason };
  }

  const normalized = normalizeUrl(raw) ?? url.href;
  return { safe: true, normalizedUrl: normalized, hostname, port };
}

export async function isSafeUrl(
  raw: string,
  policy?: SsrfPolicy,
): Promise<boolean> {
  const result = await validateUrl(raw, policy);
  return result.safe;
}
