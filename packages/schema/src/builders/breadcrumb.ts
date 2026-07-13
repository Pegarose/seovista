import { SchemaValidationError, buildAbsoluteUrl } from "../validate";
import type { SchemaNode, BreadcrumbListInput } from "../types";

export function buildBreadcrumbList(input: BreadcrumbListInput): SchemaNode {
  if (input.items.length === 0) {
    throw new SchemaValidationError("items", "BreadcrumbList must contain at least one item.");
  }

  const itemListElement = input.items.map((item, index) => {
    const absolute = buildAbsoluteUrl(input.siteUrl, item.path);
    return {
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absolute,
    };
  });

  return {
    "@type": "BreadcrumbList",
    itemListElement,
  };
}
