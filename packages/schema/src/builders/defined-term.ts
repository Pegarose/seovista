import { ensureString, rejectProhibitedClaims, buildAbsoluteUrl } from "../validate";
import type { SchemaNode, DefinedTermInput } from "../types";

export function buildDefinedTerm(input: DefinedTermInput): SchemaNode {
  rejectProhibitedClaims(input.definition as unknown as Record<string, unknown>);

  const definition = input.definition;
  const term = ensureString(definition.term, "definition.term");
  const meaning = ensureString(definition.definition, "definition.definition");
  const url = buildAbsoluteUrl(input.siteUrl, definition.canonical.path);

  return {
    "@type": "DefinedTerm",
    "@id": url,
    url,
    name: term,
    description: meaning,
    inLanguage: definition.locale || "en",
  };
}
