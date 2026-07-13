import { resolveRootUrl } from "@seovista/seo-core";
import { organizationId, websiteId } from "../ids";
import { ensureString } from "../validate";
import type { SchemaNode } from "../types";

export function buildWebSite(
  siteUrl: string,
  options: { name: string; alternateName?: string | undefined },
): SchemaNode {
  const name = ensureString(options.name, "name");

  return {
    "@type": "WebSite",
    "@id": websiteId(siteUrl),
    name,
    url: resolveRootUrl(siteUrl),
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
