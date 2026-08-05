import { extractAndValidateSchemas } from "@seovista/schema";
import { verifySchemaTruth, type SchemaTruthResult } from "@seovista/seo-core";

/**
 * Payload persisted into `job_results.payload` for a schema truth check job.
 *
 * Extends {@link SchemaTruthResult} with a tiny provenance block so the
 * result page can distinguish a parse-failure audit from a genuinely
 * "nothing to verify" audit and reach for the underlying extraction details
 * (`rawScriptCount`, `parseErrors`) without re-running the extraction.
 */
export interface SchemaTruthResultPayload extends SchemaTruthResult {
  /** Total number of `<script type="application/ld+json">` blocks found on the page. */
  readonly rawScriptCount: number;
  /** JSON parse errors produced while materializing the JSON-LD blocks. */
  readonly parseErrors: readonly string[];
}

/**
 * Runs the two-step schema truth audit.
 *
 * Step 1 (`extractAndValidateSchemas`) parses and flattens the JSON-LD
 * blocks of `html` into a list of nodes; step 2 (`verifySchemaTruth`)
 * reconciles each extractable claim against the page's visible body text.
 * The pipeline is intentionally non-throwing: malformed JSON-LD blocks are
 * surfaced as `parseErrors` instead of failing the whole job.
 */
export function processSchemaTruthPayload(
  html: string,
  pageText: string,
): SchemaTruthResultPayload {
  const extraction = extractAndValidateSchemas(html);
  const truth = verifySchemaTruth(extraction.validNodes, pageText);
  return {
    ...truth,
    rawScriptCount: extraction.rawScriptCount,
    parseErrors: extraction.parseErrors,
  };
}
