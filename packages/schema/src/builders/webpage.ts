import { websiteId } from "../ids.js";
import { ensureString, rejectProhibitedClaims, buildAbsoluteUrl } from "../validate.js";
import type { SchemaNode, WebPageInput } from "../types.js";

export function buildWebPage(input: WebPageInput): SchemaNode {
  rejectProhibitedClaims(input.page as unknown as Record<string, unknown>);

  const page = input.page;
  const title = ensureString(page.title, "page.title");
  const description = ensureString(page.description, "page.description");
  const url = buildAbsoluteUrl(input.siteUrl, page.canonical.path);

  const node: SchemaNode = {
    "@type": "WebPage",
    "@id": url,
    url,
    name: title,
    description,
    isPartOf: {
      "@id": websiteId(input.siteUrl),
    },
    inLanguage: page.locale || "en",
  };

  if (page.publishedAt) {
    node.datePublished = page.publishedAt;
  }
  if (page.modifiedAt) {
    node.dateModified = page.modifiedAt;
  }

  return node;
}
