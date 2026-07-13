import { SchemaValidationError, ensureString, rejectProhibitedClaims } from "../validate";
import type { SchemaNode, FAQPageInput } from "../types";

export function buildFAQPage(input: FAQPageInput): SchemaNode {
  if (input.faqs.length === 0) {
    throw new SchemaValidationError(
      "faqs",
      "FAQPage requires at least one visible FAQ with exact content identity.",
    );
  }

  const mainEntity: SchemaNode[] = [];
  for (const faq of input.faqs) {
    rejectProhibitedClaims(faq as unknown as Record<string, unknown>);
    const question = ensureString(faq.question, "faq.question");
    const answer = ensureString(faq.answer, "faq.answer");
    mainEntity.push({
      "@type": "Question",
      name: question,
      acceptedAnswer: {
        "@type": "Answer",
        text: answer,
      },
    });
  }

  return {
    "@type": "FAQPage",
    "@id": `${input.pageUrl}#faq`,
    url: input.pageUrl,
    mainEntity,
  };
}
