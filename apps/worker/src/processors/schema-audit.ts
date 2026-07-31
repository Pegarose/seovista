import { extractAndValidateSchemas, type SchemaAuditExtractionResult } from "@seovista/schema";

export async function processSchemaAuditJobPayload(
  html: string
): Promise<SchemaAuditExtractionResult> {
  return extractAndValidateSchemas(html);
}
