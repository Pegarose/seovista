import { organizationId, websiteId } from "../ids";
import { ensureString, validateSiteUrl } from "../validate";
import type { SchemaNode } from "../types";

export function buildWebSite(
  siteUrl: string,
  options: { name: string; alternateName?: string | undefined },
): SchemaNode {
  const name = ensureString(options.name, "name");
  const { origin } = validateSiteUrl(siteUrl);

  return {
    "@type": "WebSite",
    "@id": websiteId(siteUrl),
    name,
    url: origin,
    publisher: {
      "@id": organizationId(siteUrl),
    },
    ...(options.alternateName ? { alternateName: options.alternateName } : {}),
  };
}

export function buildWebSiteFromOrganization(
  siteUrl: string,
  organizationName: string,
): SchemaNode {
  return buildWebSite(siteUrl, { name: organizationName });
}
