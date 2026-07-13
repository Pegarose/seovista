import { SchemaValidationError, ensureString, rejectProhibitedClaims, buildAbsoluteUrl } from "../validate";
import type { SchemaNode, WebApplicationInput } from "../types";

export function buildWebApplication(
  input: WebApplicationInput,
  type: "WebApplication" | "SoftwareApplication" = "WebApplication",
): SchemaNode {
  rejectProhibitedClaims(input.tool as unknown as Record<string, unknown>);

  const tool = input.tool;
  if (!tool.isFunctioning) {
    throw new SchemaValidationError(
      "tool.isFunctioning",
      "Application schema may only be emitted for explicitly functioning tools.",
    );
  }

  const name = ensureString(tool.name, "tool.name");
  const description = ensureString(tool.description, "tool.description");
  const url = buildAbsoluteUrl(input.siteUrl, tool.canonical.path);

  const node: SchemaNode = {
    "@type": type,
    "@id": url,
    url,
    name,
    description,
    applicationCategory: "BusinessApplication",
    provider: {
      "@id": input.organizationId,
    },
    inLanguage: tool.locale || "en",
  };

  if (tool.publishedAt) {
    node.datePublished = tool.publishedAt;
  }
  if (tool.modifiedAt) {
    node.dateModified = tool.modifiedAt;
  }

  return node;
}

export function buildSoftwareApplication(input: WebApplicationInput): SchemaNode {
  return buildWebApplication(input, "SoftwareApplication");
}
