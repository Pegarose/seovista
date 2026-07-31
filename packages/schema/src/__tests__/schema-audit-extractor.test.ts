import { describe, expect, it } from "vitest";
import { extractAndValidateSchemas } from "../validate";

function wrapScript(content: string, typeAttr = 'type="application/ld+json"'): string {
  return `
    <html>
      <head>
        <script ${typeAttr}>
          ${content}
        </script>
      </head>
      <body></body>
    </html>
  `;
}

describe("extractAndValidateSchemas", () => {
  it("extracts valid JSON-LD scripts and detects prohibited claims", () => {
    const html = wrapScript(`
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Acme Corp",
        "url": "https://example.com",
        "aggregateRating": { "@type": "AggregateRating", "ratingValue": "5" }
      }
    `);

    const result = extractAndValidateSchemas(html);
    expect(result.rawScriptCount).toBe(1);
    expect(result.validNodes.length).toBe(1);
    expect(result.prohibitedClaims.length).toBe(1);
    expect(result.prohibitedClaims[0]?.field).toBe("aggregateRating");
  });

  it("does not crash or emit nodes for a null JSON-LD root", () => {
    const html = wrapScript("null");

    const result = extractAndValidateSchemas(html);
    expect(result.rawScriptCount).toBe(1);
    expect(result.validNodes).toEqual([]);
    expect(result.parseErrors).toEqual([]);
    expect(result.prohibitedClaims).toEqual([]);
  });

  it("ignores non-object JSON-LD roots (strings, numbers, booleans)", () => {
    const html = [
      wrapScript('"just a string"'),
      wrapScript("42"),
      wrapScript("true"),
    ].join("\n");

    const result = extractAndValidateSchemas(html);
    expect(result.rawScriptCount).toBe(3);
    expect(result.validNodes).toEqual([]);
    expect(result.parseErrors).toEqual([]);
  });

  it("normalizes top-level arrays into individual nodes and checks each for prohibited claims", () => {
    const html = wrapScript(`
      [
        { "@context": "https://schema.org", "@type": "WebPage", "name": "Page" },
        { "@context": "https://schema.org", "@type": "Product", "review": { "reviewBody": "fake" } },
        null,
        "not-a-node"
      ]
    `);

    const result = extractAndValidateSchemas(html);
    expect(result.rawScriptCount).toBe(1);
    expect(result.validNodes.length).toBe(2);
    expect(result.validNodes.map((n) => n["@type"])).toEqual(["WebPage", "Product"]);
    expect(result.prohibitedClaims.length).toBe(1);
    expect(result.prohibitedClaims[0]?.field).toBe("review");
  });

  it("normalizes @graph containers, merging root-level @context into entries", () => {
    const html = wrapScript(`
      {
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "WebSite", "name": "Site" },
          { "@type": "Organization", "name": "Org", "aggregateRating": { "ratingValue": "5" } }
        ]
      }
    `);

    const result = extractAndValidateSchemas(html);
    expect(result.rawScriptCount).toBe(1);
    expect(result.validNodes.length).toBe(2);
    expect(result.validNodes[0]?.["@context"]).toBe("https://schema.org");
    expect(result.validNodes[1]?.["@context"]).toBe("https://schema.org");
    expect(result.validNodes[1]?.["@type"]).toBe("Organization");
    // Prohibited claims nested inside @graph entries are detected per node.
    expect(result.prohibitedClaims.length).toBe(1);
    expect(result.prohibitedClaims[0]?.field).toBe("aggregateRating");
  });

  it("does not treat @graph entries' own properties as overridden by the container", () => {
    const html = wrapScript(`
      {
        "@context": "https://schema.org",
        "@graph": [
          { "@context": "https://example.com/custom", "@type": "WebSite" }
        ]
      }
    `);

    const result = extractAndValidateSchemas(html);
    expect(result.validNodes.length).toBe(1);
    expect(result.validNodes[0]?.["@context"]).toBe("https://example.com/custom");
  });

  it("matches the type attribute with whitespace around = and with single quotes", () => {
    const spaced = wrapScript(
      `{ "@context": "https://schema.org", "@type": "WebPage" }`,
      `type = "application/ld+json"`
    );
    const singleQuoted = wrapScript(
      `{ "@context": "https://schema.org", "@type": "WebPage" }`,
      `type='application/ld+json'`
    );

    const spacedResult = extractAndValidateSchemas(spaced);
    expect(spacedResult.rawScriptCount).toBe(1);
    expect(spacedResult.validNodes.length).toBe(1);

    const singleQuotedResult = extractAndValidateSchemas(singleQuoted);
    expect(singleQuotedResult.rawScriptCount).toBe(1);
    expect(singleQuotedResult.validNodes.length).toBe(1);
  });

  it("matches an unquoted type attribute value", () => {
    const html = wrapScript(
      `{ "@context": "https://schema.org", "@type": "WebPage" }`,
      `type=application/ld+json`
    );

    const result = extractAndValidateSchemas(html);
    expect(result.rawScriptCount).toBe(1);
    expect(result.validNodes.length).toBe(1);
  });

  it("records parse errors for malformed JSON-LD", () => {
    const html = wrapScript("{ not valid json");

    const result = extractAndValidateSchemas(html);
    expect(result.rawScriptCount).toBe(1);
    expect(result.validNodes).toEqual([]);
    expect(result.parseErrors.length).toBe(1);
  });

  it("penalizes score for missing scripts, parse errors and prohibited claims", () => {
    const empty = extractAndValidateSchemas("<html><head></head><body></body></html>");
    expect(empty.score).toBe(60); // 100 - 40 for zero scripts

    const html = wrapScript(`
      { "@context": "https://schema.org", "@type": "Product", "review": {} }
    `);
    const withClaim = extractAndValidateSchemas(html);
    expect(withClaim.score).toBe(70); // 100 - 30 for one prohibited claim
  });
});
