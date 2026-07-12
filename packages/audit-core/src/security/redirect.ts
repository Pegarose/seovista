import { validateUrl, type SsrfPolicy } from "./url.js";

export const DEFAULT_MAX_REDIRECTS = 10;

export interface RedirectHop {
  url: string;
  safe: boolean;
  reason?: string | undefined;
}

export interface RedirectValidationResult {
  safe: boolean;
  hops: RedirectHop[];
  finalUrl?: string | undefined;
  reason?: string | undefined;
}

function resolveRedirectUrl(location: string, baseUrl: string): string | null {
  try {
    return new URL(location, baseUrl).href;
  } catch {
    return null;
  }
}

/**
 * Validate a chain of redirect Location headers against the same SSRF policy at
 * every hop. The hop limit is finite and enforced before any hop is validated.
 */
export async function validateRedirectChain(
  startUrl: string,
  locations: readonly string[],
  policy: SsrfPolicy = {},
  maxHops: number = DEFAULT_MAX_REDIRECTS,
): Promise<RedirectValidationResult> {
  if (locations.length > maxHops) {
    return {
      safe: false,
      hops: [],
      reason: `Redirect chain exceeds the maximum of ${maxHops} hops`,
    };
  }

  const hops: RedirectHop[] = [];
  let currentUrl = startUrl;

  for (const location of locations) {
    const resolved = resolveRedirectUrl(location, currentUrl);
    if (resolved === null) {
      const hop: RedirectHop = { url: location, safe: false, reason: "Invalid redirect URL" };
      hops.push(hop);
      return { safe: false, hops, reason: hop.reason };
    }

    const result = await validateUrl(resolved, policy);
    const hop: RedirectHop = {
      url: resolved,
      safe: result.safe,
      reason: result.reason,
    };
    hops.push(hop);

    if (!result.safe) {
      return { safe: false, hops, reason: result.reason };
    }

    currentUrl = resolved;
  }

  return { safe: true, hops, finalUrl: currentUrl };
}

export async function isSafeRedirectChain(
  startUrl: string,
  locations: readonly string[],
  policy?: SsrfPolicy,
  maxHops?: number,
): Promise<boolean> {
  const result = await validateRedirectChain(startUrl, locations, policy, maxHops);
  return result.safe;
}
