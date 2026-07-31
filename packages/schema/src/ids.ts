import { validateSiteUrl } from "./validate.js";

export function organizationId(siteUrl: string): string {
  const { origin } = validateSiteUrl(siteUrl);
  return `${origin}/#organization`;
}

export function websiteId(siteUrl: string): string {
  const { origin } = validateSiteUrl(siteUrl);
  return `${origin}/#website`;
}

export function aboutBrandId(siteUrl: string): string {
  const { origin } = validateSiteUrl(siteUrl);
  return `${origin}/about/#brand`;
}
