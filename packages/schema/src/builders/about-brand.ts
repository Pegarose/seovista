import { aboutBrandId } from "../ids.js";
import { ensureString, rejectProhibitedClaims } from "../validate.js";
import type { SchemaNode, AboutBrandInput } from "../types.js";

export function buildAboutBrand(input: AboutBrandInput): SchemaNode {
  rejectProhibitedClaims(input.organization as unknown as Record<string, unknown>);

  const name = ensureString(input.organization.name, "organization.name");

  return {
    "@type": "Brand",
    "@id": aboutBrandId(input.siteUrl),
    name,
    url: `${input.siteUrl}/about/`,
    parentOrganization: {
      "@id": input.organizationId,
    },
  };
}
