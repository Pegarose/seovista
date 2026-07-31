import { describe, expect, it } from "vitest";
import { extractAndValidateSchemas } from "../validate";

describe("extractAndValidateSchemas", () => {
  it("extracts valid JSON-LD scripts and detects prohibited claims", () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Organization",
              "name": "Acme Corp",
              "url": "https://example.com",
              "aggregateRating": { "@type": "AggregateRating", "ratingValue": "5" }
            }
          </script>
        </head>
        <body></body>
      </html>
    `;

    const result = extractAndValidateSchemas(html, "https://example.com");
    expect(result.rawScriptCount).toBe(1);
    expect(result.validNodes.length).toBe(1);
    expect(result.prohibitedClaims.length).toBe(1);
    expect(result.prohibitedClaims[0]?.field).toBe("aggregateRating");
  });
});
