import type { RenderParityResult } from "@seovista/seo-core";
import { parseRenderSide, compareRenderSides } from "@seovista/seo-core";

/**
 * Result payload persisted into `job_results.payload` for a render parity job.
 */
export type RenderParityResultPayload = RenderParityResult;

/**
 * Compares two previously fetched HTML documents (one per side) and returns
 * the shared parity verdict defined by `@seovista/seo-core`.
 *
 * The processor receives the raw HTML strings from the queue worker so the
 * pure compare logic stays free of I/O — the worker is responsible for
 * issuing the two SSRF-guarded fetches with the browser/crawler user agents.
 */
export function processRenderParityPayload(
  defaultHtml: string,
  crawlerHtml: string,
  meta: {
    default: { url: string; status: number };
    crawler: { url: string; status: number };
  },
): RenderParityResultPayload {
  const defaultSide = parseRenderSide(defaultHtml, meta.default);
  const crawlerSide = parseRenderSide(crawlerHtml, meta.crawler);
  return compareRenderSides(defaultSide, crawlerSide);
}
