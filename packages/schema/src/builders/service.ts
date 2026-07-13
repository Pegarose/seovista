import { ensureString, rejectProhibitedClaims, buildAbsoluteUrl } from "../validate";
import type { SchemaNode, ServiceInput } from "../types";

export function buildService(input: ServiceInput): SchemaNode {
  rejectProhibitedClaims(input.service as unknown as Record<string, unknown>);

  const service = input.service;
  const name = ensureString(service.name, "service.name");
  const description = ensureString(service.description, "service.description");
  const url = buildAbsoluteUrl(input.siteUrl, service.canonical.path);

  const node: SchemaNode = {
    "@type": "Service",
    "@id": `${url}#service`,
    url,
    name,
    description,
    provider: {
      "@id": input.organizationId,
    },
    inLanguage: service.locale || "en",
  };

  if (service.publishedAt) {
    node.datePublished = service.publishedAt;
  }
  if (service.modifiedAt) {
    node.dateModified = service.modifiedAt;
  }

  return node;
}
