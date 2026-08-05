/**
 * Render Parity Diff core logic.
 *
 * Purpose: compare what the default HTTP fetch sees vs. what a crawler-flavoured
 * user agent sees. The tool answers a narrow, honest question — "does the page
 * serve essentially the same human-readable content to a crawler and to our
 * browser-flavoured fetch?" — and surfaces only signal, not an SEO verdict.
 *
 * Design notes:
 * - Pure: no I/O, no DOM runtime. The caller hands over the two HTML bodies
 *   and the function reports structured parity/divergence findings.
 * - Visible text is extracted by stripping `<script>`, `<style>`, `<noscript>`
 *   and HTML comments, decoding a small set of common entities and collapsing
 *   whitespace. This is deliberately simple and conservative — we report
 *   divergence rather than guessing semantics.
 * - The `similarity` score is derived from token overlap (Jaccard) on the two
 *   visible texts, then rebased to the project's 0–100 instrumentation band.
 *   `0` means no shared tokens at all; `100` means identical normalised
 *   text. It expresses *parity*, not *quality*.
 *
 * `renderedParityRatio` and the heading list are there so the audit page can
 * show *which* headings are missing in each variant, which is the actual
 * "what did the crawler lose?" question the instrument exists to answer.
 */

export interface RenderSide {
  /** Final URL after redirects; useful when the two fetches end up on different hosts. */
  readonly url: string;
  /** HTTP status of the final response. */
  readonly status: number;
  /** `<title>` (view-source). Empty when not found. */
  readonly title: string;
  /** Meta description. Empty when not found. */
  readonly metaDescription: string;
  /** Canonical link. Empty when not found. */
  readonly canonical: string;
  /** `<h1>` elements, in document order. */
  readonly h1: readonly string[];
  /** First 20 `<h2>` elements, in document order. */
  readonly h2: readonly string[];
  /** Normalised visible text of `<body>`. */
  readonly visibleText: string;
  /** Total token count of the visible text after normalisation. */
  readonly tokenCount: number;
}

export interface RenderParityIssue {
  readonly field:
    | "title"
    | "metaDescription"
    | "canonical"
    | "h1"
    | "text"
    | "status";
  readonly severity: "warning" | "error";
  /** Human-readable, user-facing description of the divergence. */
  readonly description: string;
}

export interface RenderParityResult {
  readonly kind: "render-parity";
  /** 0–100 parity indicator (see module docstring). */
  readonly score: number;
  /** Token-overlap ratio (0-1, 1 = identical visible text). */
  readonly renderedParityRatio: number;
  readonly default: RenderSide;
  readonly crawler: RenderSide;
  /** H1 values found only in the default fetch. */
  readonly h1OnlyInDefault: readonly string[];
  /** H1 values found only in the crawler fetch. */
  readonly h1OnlyInCrawler: readonly string[];
  readonly issues: readonly RenderParityIssue[];
}

const ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
  nbsp: " ",
};

/** Small HTML entity decoder — just enough for visible-text parity checks. */
function decodeEntities(text: string): string {
  return text.replace(/&([a-zA-Z#\d]+);/g, (_m, entity: string) => ENTITY_MAP[entity] ?? _m);
}

/** Strips scripts, styles, comments and tags, returning collapsed visible text. */
export function extractVisibleText(html: string): string {
  // Only the <body> carries visible content — <head> contents (title, meta)
  // are metadata rather than visible text, and including them would let a
  // JS-shell crawler variant keep a small "title token" overlap that we want
  // the parity detector to treat as effectively zero.
  const bodyMatch = html.match(/<body\b[\s\S]*?<\/body>/i);
  // When the snippet under test doesn't even carry a <body> wrapper (crawler
  // shells, partial fixtures) we fall back to scanning the entire document
  // so the extractor still reports *something* rather than the empty string.
  const bodyHtml = bodyMatch ? bodyMatch[0] : html;
  return decodeEntities(
    bodyHtml
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** Lowercases + collapses whitespace for stable comparisons (no accent stripping). */
function normalizeForMatch(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function tokenize(text: string): ReadonlySet<string> {
  return new Set(
    normalizeForMatch(text)
      .split(/\s+/)
      .filter((token) => token.length > 0),
  );
}

function jaccard(lhs: ReadonlySet<string>, rhs: ReadonlySet<string>): number {
  if (lhs.size === 0 && rhs.size === 0) return 1;
  const intersection = new Set([...lhs].filter((token) => rhs.has(token)));
  const union = new Set([...lhs, ...rhs]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function firstMatch(html: string, pattern: RegExp): string {
  const m = html.match(pattern);
  return decodeEntities((m?.[1] ?? "").replace(/\s+/g, " ").trim());
}

function allMatches(html: string, pattern: RegExp): string[] {
  const out: string[] = [];
  // Copy regex to avoid mutating lastIndex of a shared global regex.
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.push(decodeEntities((m[1] ?? "").replace(/\s+/g, " ").trim()));
    if (out.length >= 20) break; // keep payloads small and bounded
  }
  return out;
}

/** Default browser-flavoured UA we send on the baseline fetch. */
export const DEFAULT_BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/** Crawler-flavoured UA matching the deployed agent's public identity. */
export const CRAWLER_UA = "Mozilla/5.0 (compatible; SeoVistaBot/1.0; +https://seovista.com/bot)";

/**
 * Parses one side of the render parity check from raw HTML.
 *
 * All extraction is text-only regex. The audit is signal-oriented, so the
 * unavailability of a headless DOM here is intentional: we surface h1/title/
 * meta/canonical/text variance without pretending a real browser ran.
 */
/** Strips tags from an <h1>/<h2> fragment without requiring a full document. */
function stripFragmentTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function parseRenderSide(
  html: string,
  meta: { url: string; status: number },
): RenderSide {
  const h1 = allMatches(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/gi).map(stripFragmentTags);
  const h2 = allMatches(html, /<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)
    .map(stripFragmentTags)
    .slice(0, 20);

  const visibleText = extractVisibleText(html);
  return {
    url: meta.url,
    status: meta.status,
    title: firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    metaDescription: firstMatch(
      html,
      /<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["'][^>]*>/i,
    ) || firstMatch(
      html,
      /<meta\s+content=["']([\s\S]*?)["']\s+name=["']description["'][^>]*>/i,
    ),
    canonical: firstMatch(
      html,
      /<link\s+rel=["']canonical["']\s+href=["']([\s\S]*?)["'][^>]*>/i,
    ) || firstMatch(
      html,
      /<link\s+href=["']([\s\S]*?)["']\s+rel=["']canonical["'][^>]*>/i,
    ),
    h1,
    h2,
    visibleText,
    tokenCount: normalizeForMatch(visibleText).split(/\s+/).filter(Boolean).length,
  };
}

function diffLists(
  a: readonly string[],
  b: readonly string[],
): { onlyInA: string[]; onlyInB: string[] } {
  const bSet = new Set(b.map(normalizeForMatch));
  const aSet = new Set(a.map(normalizeForMatch));
  return {
    onlyInA: a.filter((x) => !bSet.has(normalizeForMatch(x))),
    onlyInB: b.filter((x) => !aSet.has(normalizeForMatch(x))),
  };
}

/**
 * Renders the parity verdict from two pre-parsed sides.
 *
 * Compares status → title/meta/canonical → h1 sets → visible text. Each
 * divergence is reported as an issue; `score` combines a Jaccard token
 * overlap (0–70 weight) with structural checkbox bonuses (h1 parity, status
 * parity, title parity; 30 total) so a page whose crawler-visible body
 * collapsed to a JS shell but still kept `<title>` doesn't score 0.
 */
export function compareRenderSides(
  defaultSide: RenderSide,
  crawlerSide: RenderSide,
): RenderParityResult {
  const issues: RenderParityIssue[] = [];

  if (defaultSide.status !== crawlerSide.status) {
    issues.push({
      field: "status",
      severity: "error",
      description: `HTTP durumu farklı: varsayılan ${defaultSide.status}, tarayıcı ${crawlerSide.status}.`,
    });
  }

  if (normalizeForMatch(defaultSide.title) !== normalizeForMatch(crawlerSide.title)) {
    issues.push({
      field: "title",
      severity: "warning",
      description: "<title> içeriği iki tarafta farklı. Arama motorları ve kullanıcılar aynı başlığı görmüyor.",
    });
  }

  if (normalizeForMatch(defaultSide.metaDescription) !== normalizeForMatch(crawlerSide.metaDescription)) {
    issues.push({
      field: "metaDescription",
      severity: "warning",
      description: "Meta açıklama iki tarafta farklı içeriyor.",
    });
  }

  if (normalizeForMatch(defaultSide.canonical) !== normalizeForMatch(crawlerSide.canonical)) {
    issues.push({
      field: "canonical",
      severity: "warning",
      description: "Canonical URL iki tarafta farklı tanımlanmış — çiftlenmiş içeriklerin hangi kopyaya işaret ettiği belirsizleşir.",
    });
  }

  const h1Diff = diffLists(defaultSide.h1, crawlerSide.h1);
  if (h1Diff.onlyInA.length > 0 || h1Diff.onlyInB.length > 0) {
    issues.push({
      field: "h1",
      severity: "error",
      description: `H1 başlıkları iki tarafta farklı (${h1Diff.onlyInA.length} sadece varsayılanda, ${h1Diff.onlyInB.length} sadece tarayıcıda).`,
    });
  }

  const parityRatio = jaccard(tokenize(defaultSide.visibleText), tokenize(crawlerSide.visibleText));
  const emptyDefault = defaultSide.visibleText.length === 0;
  const emptyCrawler = crawlerSide.visibleText.length === 0;
  if (emptyDefault !== emptyCrawler) {
    issues.push({
      field: "text",
      severity: "error",
      description: emptyCrawler
        ? "Tarayıcı tarafında görünür metin bulunamadı — sayfa JS-shell'e indirgenmiş olabilir."
        : "Varsayılan tarafta görünür metin bulunamadı.",
    });
  } else if (!emptyDefault && parityRatio < 0.9) {
    issues.push({
      field: "text",
      severity: "warning",
      description: `Görünür metin "${Math.round(parityRatio * 100)}%" örtüşüyor; bir taraf farklı veya kısaltılmış içerik sunuyor.`,
    });
  }

  const structuralParity =
    (defaultSide.status === crawlerSide.status ? 1 : 0) +
    (normalizeForMatch(defaultSide.title) === normalizeForMatch(crawlerSide.title) ? 1 : 0) +
    (h1Diff.onlyInA.length === 0 && h1Diff.onlyInB.length === 0 ? 1 : 0);

  // unbounded Jaccard (0–1) → 0–70; structural parity (0..3 booleans) → 0–30
  const score = Math.round(
    Math.max(0, Math.min(100, parityRatio * 70 + structuralParity * 10)),
  );

  return {
    kind: "render-parity",
    score,
    renderedParityRatio: parityRatio,
    default: defaultSide,
    crawler: crawlerSide,
    h1OnlyInDefault: h1Diff.onlyInA,
    h1OnlyInCrawler: h1Diff.onlyInB,
    issues,
  };
}
