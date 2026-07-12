import { parse, IPv4, IPv6 } from "ipaddr.js";

const DENIED_IPV4_CIDRS: readonly string[] = [
  "0.0.0.0/8", // unspecified
  "127.0.0.0/8", // loopback
  "10.0.0.0/8", // private (RFC1918)
  "172.16.0.0/12", // private (RFC1918)
  "192.168.0.0/16", // private (RFC1918)
  "100.64.0.0/10", // carrier-grade NAT (CGNAT)
  "169.254.0.0/16", // link-local
  "224.0.0.0/4", // multicast
  "240.0.0.0/4", // reserved (IPv4 future use)
  "255.255.255.255/32", // broadcast
  "192.0.2.0/24", // documentation (TEST-NET-1)
  "198.51.100.0/24", // documentation (TEST-NET-2)
  "198.18.0.0/15", // benchmark
  "203.0.113.0/24", // documentation (TEST-NET-3)
];

const DENIED_IPV6_CIDRS: readonly string[] = [
  "::/128", // unspecified
  "::1/128", // loopback
  "::ffff:0:0/96", // IPv4-mapped IPv6
  "fe80::/10", // link-local
  "fc00::/7", // unique-local (ULA)
  "ff00::/8", // multicast
  "2001:db8::/32", // documentation
];

const DENIED_HOSTS: readonly string[] = ["169.254.169.254"];

export interface AddressValidationResult {
  safe: boolean;
  reason?: string | undefined;
}

function isInCidr(ip: IPv4 | IPv6, cidr: string): boolean {
  if (ip instanceof IPv4) {
    const [range, prefix] = IPv4.parseCIDR(cidr);
    return ip.match(range, prefix);
  }

  const [range, prefix] = IPv6.parseCIDR(cidr);
  return ip.match(range, prefix);
}

function checkDeniedCidrs(ip: IPv4 | IPv6): string | undefined {
  if (ip instanceof IPv4) {
    for (const cidr of DENIED_IPV4_CIDRS) {
      if (isInCidr(ip, cidr)) {
        return `IPv4 address is in denied range ${cidr}`;
      }
    }
  } else {
    for (const cidr of DENIED_IPV6_CIDRS) {
      if (isInCidr(ip, cidr)) {
        return `IPv6 address is in denied range ${cidr}`;
      }
    }
  }

  return undefined;
}

export function validateIpAddress(ip: string): AddressValidationResult {
  try {
    const parsed = parse(ip);
    const reason = checkDeniedCidrs(parsed);
    if (reason) {
      return { safe: false, reason };
    }
    return { safe: true };
  } catch {
    return { safe: false, reason: "Invalid IP address" };
  }
}

export function isSafeIpAddress(ip: string): boolean {
  return validateIpAddress(ip).safe;
}

export function validateHostname(hostname: string): AddressValidationResult {
  const lower = hostname.toLowerCase();

  if (DENIED_HOSTS.includes(lower)) {
    return { safe: false, reason: "Host is a known metadata endpoint" };
  }

  if (lower === "localhost" || lower.endsWith(".localhost")) {
    return { safe: false, reason: "localhost is not allowed" };
  }

  return { safe: true };
}

export function isSafeHostname(hostname: string): boolean {
  return validateHostname(hostname).safe;
}

export function validateResolverResult(ips: string[]): AddressValidationResult {
  if (ips.length === 0) {
    return { safe: false, reason: "Resolver returned no addresses" };
  }

  for (const ip of ips) {
    const result = validateIpAddress(ip);
    if (!result.safe) {
      return result;
    }
  }

  return { safe: true };
}

export { DENIED_IPV4_CIDRS, DENIED_IPV6_CIDRS, DENIED_HOSTS };
