import { buildAbsoluteUrl } from "../validate.js";
import type { SchemaNode, BreadcrumbListInput } from "../types.js";

export function buildBreadcrumbList(input: BreadcrumbListInput): SchemaNode {
  if (input.items.length === 0) {
    throw new Error("BreadcrumbList must contain at least one item.");
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
