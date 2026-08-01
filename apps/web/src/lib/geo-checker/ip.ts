/**
 * Extracts the client IP used for rate limiting.
 *
 * Deployment assumption: SeoVista runs behind a single trusted reverse proxy
 * (Coolify/Traefik) that appends the real client IP as the LAST
 * `x-forwarded-for` entry. Every earlier entry is client-controlled and
 * trivially spoofable, so the first entry must never be trusted. Falls back
 * to `x-real-ip`, then loopback.
 */
export function extractClientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const ips = forwardedFor
      .split(",")
      .map((ip) => ip.trim())
      .filter((ip) => ip.length > 0);
    const last = ips.at(-1);
    if (last) return last;
  }

  const realIp = headers.get("x-real-ip");
  if (realIp && realIp.trim()) {
    return realIp.trim();
  }

  return "127.0.0.1";
}
