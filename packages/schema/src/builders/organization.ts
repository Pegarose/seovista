import type { Organization } from "@seovista/content-models";
import { resolveRootUrl } from "@seovista/seo-core";
import { organizationId } from "../ids";
import { SchemaValidationError, ensureString, rejectProhibitedClaims } from "../validate";
import type { SchemaNode } from "../types";

const EXPECTED_PARENT_NAME = "GMedya Group";

export function buildOrganization(siteUrl: string, organization: Organization): SchemaNode {
  rejectProhibitedClaims(organization as unknown as Record<string, unknown>);

  const name = ensureString(organization.name, "name");
  const orgId = organizationId(siteUrl);

  if (organization.parentOrganization !== EXPECTED_PARENT_NAME) {
    throw new SchemaValidationError(
      "organization.parentOrganization",
      `Organization parentOrganization must truthfully identify ${EXPECTED_PARENT_NAME}.`,
    );
  }

  const node: SchemaNode = {
    "@type": "Organization",
    "@id": orgId,
    name,
    url: resolveRootUrl(siteUrl),
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
