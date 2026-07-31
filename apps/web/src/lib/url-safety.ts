/**
 * Shared form-level SSRF guard for audit tools (Schema Checker, AI Crawler
 * Checker, ...).
 *
 * This is a defense-in-depth form guard only. The authoritative SSRF boundary
 * is the worker fetcher (`apps/worker/src/utils/fetcher.ts`), which performs
 * DNS resolution and blocks loopback/link-local/private/reserved ranges via
 * ipaddr.js before any network call.
 */

type Ipv4Octets = [number, number, number, number];

function parseIpv4(hostname: string): Ipv4Octets | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value < 0 || value > 255) return null;
    octets.push(value);
  }
  return octets as Ipv4Octets;
}

function isForbiddenIpv4(octets: Ipv4Octets): boolean {
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 127) return true; // 127.0.0.0/8 loopback (entire range)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 carrier-grade NAT
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  return false;
}

/**
 * Expands an IPv6 address literal (without brackets, lowercase, optional
 * embedded IPv4 tail) into its 8 hextets, or returns null when unparsable.
 */
function expandIpv6(input: string): number[] | null {
  let h = input;
  const zoneIndex = h.indexOf("%");
  if (zoneIndex >= 0) h = h.slice(0, zoneIndex);

  // Embedded IPv4 tail (e.g. ::ffff:127.0.0.1) counts as two hextets.
  let v4: Ipv4Octets | null = null;
  const lastColon = h.lastIndexOf(":");
  const tail = lastColon >= 0 ? h.slice(lastColon + 1) : h;
  if (tail.includes(".")) {
    v4 = parseIpv4(tail);
    if (!v4) return null;
    h = lastColon >= 0 ? h.slice(0, lastColon) : "";
  }

  const halves = h.split("::");
  if (halves.length > 2) return null;
  const hasCompressed = halves.length === 2;

  const left = halves[0] ? halves[0].split(":").filter(Boolean) : [];
  const right = hasCompressed && halves[1] ? halves[1]!.split(":").filter(Boolean) : [];

  const v4Hextets = v4 ? 2 : 0;
  const total = left.length + right.length + v4Hextets;
  if (total > 8) return null;
  if (!hasCompressed && total !== 8) return null;

  const parseHextet = (part: string): number | null => {
    if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
    return parseInt(part, 16);
  };

  const hextets: number[] = [];
  for (const part of left) {
    const value = parseHextet(part);
    if (value === null) return null;
    hextets.push(value);
  }
  const missing = 8 - total;
  for (let i = 0; i < missing; i++) hextets.push(0);
  for (const part of right) {
    const value = parseHextet(part);
    if (value === null) return null;
    hextets.push(value);
  }
  if (v4) {
    hextets.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
  }
  return hextets;
}

function isForbiddenIpv6(hostname: string): boolean {
  // WHATWG URL serializes IPv6 hostnames with brackets — strip them.
  const bare = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  const hextets = expandIpv6(bare.toLowerCase());
  // An unparsable IPv6 literal fails closed.
  if (!hextets) return true;

  const allZero = hextets.every((h) => h === 0);
  if (allZero) return true; // :: unspecified
  if (hextets.slice(0, 7).every((h) => h === 0) && hextets[7] === 1) {
    return true; // ::1 loopback
  }
  if ((hextets[0]! & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((hextets[0]! & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local

  // IPv4-mapped (::ffff:0:0/96) and deprecated IPv4-compatible (::/96)
  // addresses defer to the IPv4 range checks on the embedded address.
  const firstFiveZero = hextets.slice(0, 5).every((h) => h === 0);
  if (firstFiveZero && (hextets[5] === 0xffff || hextets[5] === 0)) {
    const embedded: Ipv4Octets = [
      (hextets[6]! >> 8) & 0xff,
      hextets[6]! & 0xff,
      (hextets[7]! >> 8) & 0xff,
      hextets[7]! & 0xff,
    ];
    return isForbiddenIpv4(embedded);
  }

  return false;
}

function isForbiddenHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();

  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h.endsWith(".corp")
  ) {
    return true;
  }

  // IPv6 literals arrive bracketed (e.g. "[::1]").
  if (h.startsWith("[")) {
    return isForbiddenIpv6(h);
  }

  const ipv4 = parseIpv4(h);
  if (ipv4) {
    return isForbiddenIpv4(ipv4);
  }

  return false;
}

export function isSafePublicHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Only HTTP(S) targets are auditable; file:, ftp:, javascript: and
    // every other scheme are rejected outright.
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    if (isForbiddenHostname(parsed.hostname)) return false;

    return true;
  } catch {
    return false;
  }
}
