import { extractAndValidateSchemas, type SchemaAuditExtractionResult } from "@seovista/schema";

export async function processSchemaAuditJobPayload(
  url: string,
  html: string
): Promise<SchemaAuditExtractionResult> {
  return extractAndValidateSchemas(html, url);
}
