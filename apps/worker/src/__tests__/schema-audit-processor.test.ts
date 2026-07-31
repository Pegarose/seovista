import { describe, expect, it } from "vitest";
import { processSchemaAuditJobPayload } from "../processors/schema-audit.js";

describe("processSchemaAuditJobPayload", () => {
  it("processes HTML and returns audit result payload", async () => {
    const mockHtml = `
      <html>
        <head>
          <script type="application/ld+json">
            { "@context": "https://schema.org", "@type": "WebPage", "name": "Test Page" }
          </script>
        </head>
      </html>
    `;
    const result = await processSchemaAuditJobPayload("https://example.com", mockHtml);
    expect(result.score).toBeGreaterThan(0);
    expect(result.rawScriptCount).toBe(1);
    expect(result.validNodes.length).toBe(1);
  });
});
