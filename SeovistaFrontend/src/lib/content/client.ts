import { isRawCollectionResponse } from "./guards";
import type { CollectionResult, PublicCollection, RawEntity } from "./types";

/**
 * Backend base URL is supplied by the deployment environment. When unset, the
 * frontend renders truthful unavailable/empty states — never fabricated data.
 * Preview access is server-only; the browser only ever asks for public content.
 */
const BASE_URL = ((import.meta.env.VITE_SEOVISTA_API_BASE ?? "") as string)
  .trim()
  .replace(/\/$/, "");

/** Collections that must never be requested from the browser. */
const FORBIDDEN: ReadonlySet<string> = new Set(["auditLeads", "caseStudies"]);

export async function fetchCollection(
  collection: PublicCollection,
  opts: { locale?: string; signal?: AbortSignal } = {},
): Promise<CollectionResult<RawEntity>> {
  if (FORBIDDEN.has(collection)) {
    return { status: "unavailable", reason: "error", code: "FORBIDDEN_CLIENT_COLLECTION" };
  }
  if (!BASE_URL) {
    return { status: "unavailable", reason: "not-configured" };
  }

  const locale = opts.locale ?? "en";
  const url = `${BASE_URL}/api/${encodeURIComponent(collection)}?mode=public&locale=${encodeURIComponent(locale)}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: opts.signal,
    });
    if (!res.ok) {
      return { status: "unavailable", reason: "error", code: String(res.status) };
    }
    const data: unknown = await res.json();
    if (!isRawCollectionResponse(data) || data.mode !== "public") {
      return { status: "unavailable", reason: "invalid" };
    }
    // Defence-in-depth: strip anything not explicitly published.
    const items = data.items.filter((it) => it.provenance.status === "published");
    return { status: "ok", items, generatedAt: data.generatedAt };
  } catch {
    return { status: "unavailable", reason: "network" };
  }
}
