import { traceAttribution, type AttributionTraceResult, type SourceDocument } from "@seovista/seo-core";

/**
 * Inputs the worker provides to the attribution trace processor.
 * The processor is otherwise pure — it never issues network requests, never
 * touches the database, and never talks to an LLM.
 */
export interface ProcessAttributionTraceInput {
  /** Pasted AI answer supplied by the user. Capped server-side to a sane length. */
  readonly answer: string;
  /** SRS-visible text of the site's home page. */
  readonly selfText: string;
  /** The audited domain (used for labels + SERP query). */
  readonly domain: string;
  /** Optional SERP-derived source documents. Empty when no provider is configured. */
  readonly serpSources?: readonly SourceDocument[];
}

export interface AttributionTraceResultPayload extends AttributionTraceResult {
  /** SERP source labels (parallel to verdicts) so the UI can resolve the best-source label. */
  readonly serpSources: readonly SourceDocument[];
}

export function processAttributionTracePayload(
  input: ProcessAttributionTraceInput,
): AttributionTraceResultPayload {
  const serpSources = (input.serpSources ?? []);

  const result = traceAttribution(input.answer, {
    selfLabel: input.domain,
    selfText: input.selfText,
    selfUrl: `https://${input.domain}/`,
    serpSources,
  });

  return {
    ...result,
    serpSources,
  };
}
