/**
 * Schema Truth Check core logic.
 *
 * Purpose: check that the claims inside a page's JSON-LD markup actually
 * appear in the page's visible human-readable content. The tool answers a
 * narrow, honest question — "can a reader find on the page itself what the
 * structured data asserts?" — not "is the schema good/bad on a global scale".
 *
 * Design notes:
 * - Pure: no I/O, no user-agent sniffing, no LLMs. The caller provides the
 *   JSON-LD values and the plain text content of the page and the function
 *   reports a verdict per claim.
 * - Typed nodes we look at are intentionally small and defensible per the
 *   SeoVista content policy:
 *     - Organization: `name`, `legalName`, `url`, `sameAs`
 *     - Person: `name`, `jobTitle`
 *     - Article / BlogPosting / NewsArticle: `headline`, `datePublished`
 *     - Product / Service: `name`, `offers.price`, `offers.priceCurrency`,
 *       `review`/`aggregateRating` (which this project's builders reject as
 *       fabricatable — see `@seovista/schema` PROHIBITED_CLAIMS), and
 *       `description`
 *   Claims located so far outside that vocabulary are intentionally not
 *   checked to keep the verifier honest about its strength.
 * - Normalization is conservative (whitespace collapse, lowercase,
 *   accent-strip, punctuation strip). Matched claims must appear verbatim
 *   after normalization; otherwise they are flagged as `not_verifiable`
 *   rather than "wrong".
 */

/** One claimed value that did/did not survive reconciliation against the page body. */
export interface TruthClaim {
  /** Dot-path of the claimed property inside the JSON-LD node (e.g. `offers.price`). */
  readonly field: string;
  /** The value as stated in the schema (already string-coerced). */
  readonly value: string;
  /** Verdict after reconciliation against the visible page text. */
  readonly status: "verified" | "not_verifiable";
}

/**
 * Aggregate truth-check result for a single page.
 *
 * `score` is a 0–100 indicator of how many of the extractable claims could
 * be reconciled against the visible page text, with a hard floor at 0 so a
 * page with zero extractable claims and zero JSON-LD blocks reports 100
 * (there is nothing to be wrong about), and a page whose JSON-LD asserts
 * values absent from the body reports proportionally lower. This mirrors the
 * instruments principle: a truthful indicator, never a claim of quality.
 */
export interface SchemaTruthResult {
  readonly kind: "schema-truth";
  readonly score: number;
  /** Total number of extractable claims considered. */
  readonly totalClaims: number;
  /** Number of claims found verbatim on the page. */
  readonly verifiedClaims: number;
  /** Number of claims not found verbatim on the page. */
  readonly notVerifiableClaims: number;
  readonly findings: readonly TruthClaim[];
}

/**
 * Field selectors for known typed nodes. Kept intentionally narrow: a claim
 * must be checkable verbatim against visible text to count.
 */
const EXTRACTABLE_STRING_FIELDS: Record<string, readonly (readonly [string, string])[]> = {
  Organization: [
    ["name", "name"],
    ["legalName", "legalName"],
    ["url", "url"],
  ],
  Person: [
    ["name", "name"],
    ["jobTitle", "jobTitle"],
  ],
  Article: [
    ["headline", "headline"],
    ["description", "description"],
  ],
  BlogPosting: [
    ["headline", "headline"],
    ["description", "description"],
  ],
  NewsArticle: [
    ["headline", "headline"],
    ["description", "description"],
  ],
  Product: [
    ["name", "name"],
    ["description", "description"],
  ],
  Service: [
    ["name", "name"],
    ["description", "description"],
  ],
};

/**
 * Same `@type` values may appear as a string or a string array — normalize
 * to a string array so `Article | ["Article", "BlogPosting"]` both work.
 */
function coerceTypeList(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return [];
}

/** Attempts to read a scalar string from an arbitrary JSON-LD value. */
function maybeString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return null;
}

/**
 * Flattens a normalized string for verbatim-match comparison. Whitespace is
 * collapsed, accents stripped and ASCII punctuation removed so a page that
 * renders `SeoVista – Global GEO` in curly quotes still matches the schema
 * claim of `SeoVista - Global GEO`. We deliberately do not fuzzy-match: an
 * unmatched claim is reported as `not_verifiable` rather than guessed.
 */
export function normalizeForTruthMatch(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface ClaimCandidate {
  readonly field: string;
  readonly value: string;
}

/**
 * Collect the extractable claims of a single JSON-LD node. SameAs arrays are
 * treated as a whole (the page only needs to list the linked profiles to
 * pass); each entry still counts as its own claim because a fabricated URL
 * would otherwise hide in the noise.
 */
function collectClaimsFromNode(node: Record<string, unknown>): ClaimCandidate[] {
  const claims: ClaimCandidate[] = [];
  const types = coerceTypeList(node["@type"]);

  // De-duplicate on (field, value): an `["Article", "BlogPosting"]` node
  // whose `headline`/`description` would otherwise be extracted twice (once
  // per selector set) ends up with one claim per (path, value).
  const seen = new Set<string>();
  const push = (claim: ClaimCandidate) => {
    const key = `${claim.field}${claim.value}`;
    if (seen.has(key)) return;
    seen.add(key);
    claims.push(claim);
  };

  for (const t of types) {
    const selectors = (EXTRACTABLE_STRING_FIELDS as Record<string, readonly (readonly [string, string])[] | undefined>)[t];
    if (!selectors) continue;
    for (const [path, key] of selectors) {
      const value = maybeString(node[key]);
      if (value) push({ field: path, value });
    }
  }

  const sameAs = node["sameAs"];
  if (Array.isArray(sameAs)) {
    for (const entry of sameAs) {
      const value = maybeString(entry);
      if (value) push({ field: "sameAs", value });
    }
  }

  // `offers.price` / `offers.priceCurrency` for Product/Service. Read the
  // first offers entry only to stay conservative — a page advertising
  // numerous prices should still show the primary one in the body text.
  const offers = node["offers"];
  const firstOffer = Array.isArray(offers) ? offers[0] : offers;
  if (firstOffer && typeof firstOffer === "object") {
    const price = (firstOffer as Record<string, unknown>)["price"];
    const currency = (firstOffer as Record<string, unknown>)["priceCurrency"];
    if (typeof price === "number" || typeof price === "string") {
      push({ field: "offers.price", value: String(price) });
    }
    const currencyString = maybeString(currency);
    if (currencyString) push({ field: "offers.priceCurrency", value: currencyString });
  }

  // Fabrication-sensitive numeric claims — the builders already reject them,
  // so when they do appear we want the audit to report them explicitly
  // instead of silently ignoring.
  for (const key of ["ratingValue", "reviewCount", "awards"] as const) {
    const raw = node[key];
    if (typeof raw === "number" || typeof raw === "string") {
      push({ field: key, value: String(raw) });
    } else if (Array.isArray(raw)) {
      for (const item of raw) {
        const value = maybeString(item);
        if (value) push({ field: key, value });
      }
    }
  }

  return claims;
}

/**
 * Reconciles the JSON-LD claims of `nodes` against `pageText`.
 *
 * `pageText` is the plain visible body text the caller extracted from the
 * HTML — the verifier does NOT parse HTML itself so it stays pure.
 */
export function verifySchemaTruth(
  nodes: readonly Record<string, unknown>[],
  pageText: string,
): SchemaTruthResult {
  const claims = nodes.flatMap(collectClaimsFromNode);
  const normalizedPage = normalizeForTruthMatch(pageText);

  const findings: TruthClaim[] = claims.map((c) => ({
    field: c.field,
    value: c.value,
    status: normalizedPage.includes(normalizeForTruthMatch(c.value))
      ? "verified"
      : "not_verifiable",
  }));

  const verifiedClaims = findings.filter((f) => f.status === "verified").length;
  const notVerifiableClaims = findings.length - verifiedClaims;

  const totalClaims = findings.length;
  const score =
    totalClaims === 0 ? 100 : Math.max(0, Math.min(100, Math.round((verifiedClaims / totalClaims) * 100)));

  return {
    kind: "schema-truth",
    score,
    totalClaims,
    verifiedClaims,
    notVerifiableClaims,
    findings,
  };
}
