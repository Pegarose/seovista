import { ensureString, rejectProhibitedClaims, buildAbsoluteUrl } from "../validate.js";
import type { SchemaNode, PersonInput } from "../types.js";

export function buildPerson(input: PersonInput): SchemaNode {
  rejectProhibitedClaims(input.author as unknown as Record<string, unknown>);

  const author = input.author;
  const name = ensureString(author.name, "author.name");
  const url = buildAbsoluteUrl(input.siteUrl, author.canonical.path);

  const node: SchemaNode = {
    "@type": "Person",
    "@id": url,
    url,
    name,
  };

  if (author.bio) {
    node.description = author.bio;
  }
  if (author.photo) {
    node.image = author.photo;
  }

  if (author.socialProfiles && Object.keys(author.socialProfiles).length > 0) {
    node.sameAs = Object.values(author.socialProfiles);
  }

  return node;
}
