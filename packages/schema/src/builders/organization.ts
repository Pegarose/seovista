import type { Organization } from "@seovista/content-models";
import { organizationId } from "../ids.js";
import { ensureString, rejectProhibitedClaims } from "../validate.js";
import type { SchemaNode } from "../types.js";

const EXPECTED_PARENT_NAME = "GMedya Group";

export function buildOrganization(siteUrl: string, organization: Organization): SchemaNode {
  rejectProhibitedClaims(organization as unknown as Record<string, unknown>);

  const name = ensureString(organization.name, "name");
  const orgId = organizationId(siteUrl);

  if (organization.parentOrganization !== EXPECTED_PARENT_NAME) {
    throw new Error(
      `Organization parentOrganization must truthfully identify ${EXPECTED_PARENT_NAME}.`,
    );
  }

  const node: SchemaNode = {
    "@type": "Organization",
    "@id": orgId,
    name,
    url: siteUrl,
    parentOrganization: {
      "@type": "Organization",
      name: EXPECTED_PARENT_NAME,
    },
  };

  if (organization.description) {
    node.description = organization.description;
  }
  if (organization.logo) {
    node.logo = organization.logo;
  }

  return node;
}
