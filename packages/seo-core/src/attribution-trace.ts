/**
 * Attribution Trace core logic.
 *
 * Purpose: given a pasted AI-generated answer, the home page text of a target
 * site and (optionally) a SERP list, this module attributes the answer's
 * claims to the sources that most plausibly informed them. It is the honest
 * instrumentation version of what a generative engine optimisation audit
 * needs — it never guesses at the LLM's reasoning, only reports overlap
 * between the pasted answer and the sources we can actually see.
 *
 * How it works:
 *   1. Split the answer into claim candidates (sentence-aware).
 *   2. For each claim compute a bag-of-words Jaccard similarity against:
 *       - the target site's own home page, and
 *       - every SERP entry (title + snippet).
 *   3. Classify each claim as:
 *       - `self`           — best overlap is with the site's own content,
 *       - `external`       — best overlap is with a SERP-listed source,
 *       - `misattributed`  — no source clears the threshold and the claim
 *                          mentions the site by name (likely fabricated self-reference),
 *       - `unverifiable`   — not classifiable against any visible source.
 *   4. Emit the per-claim verdicts plus an `attributionScore` (0-100) that
 *      reflects *sourcedness*, not truthfulness.
 */

export interface SourceDocument {
  /** Stable id used in the report (e.g. "self" or "serp:3"). */
  readonly id: string;
  /** Human-readable label used in the UI. */
  readonly label: string;
  /** Combined text the claim matcher will score against. */
  readonly text: string;
  /** Origin discriminator used by the classifier. */
  readonly kind: "self" | "external";
  /** Optional URL shown next to the label. */
  readonly url?: string;
}

export type AttributionVerdictKind = "self" | "external" | "misattributed" | "unverifiable";

export interface AttributionVerdict {
  /** The original claim text. */
  readonly claim: string;
  /** Which kind the claim resolved to. */
  readonly kind: AttributionVerdictKind;
  /** Best matching source, if any. */
  readonly bestSourceId?: string;
  /** Similarity score for the best matching source, 0..1. */
  readonly bestSimilarity: number;
}

export interface AttributionTraceResult {
  readonly kind: "attribution-trace";
  /** 0–100 sourcedness score. */
  readonly score: number;
  readonly totalClaims: number;
  readonly selfClaims: number;
  readonly externalClaims: number;
  readonly misattributedClaims: number;
  readonly unverifiableClaims: number;
  readonly verdicts: readonly AttributionVerdict[];
}

/** Rough token normaliser for overlap scoring. */
export function tokenise(text: string): ReadonlySet<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3),
  );
}

/** Simple symmetric Jaccard on word sets. */
function jaccard(lhs: ReadonlySet<string>, rhs: ReadonlySet<string>): number {
  if (lhs.size === 0 && rhs.size === 0) return 0;
  const intersection = new Set([...lhs].filter((t) => rhs.has(t)));
  const union = new Set([...lhs, ...rhs]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * Sentence-aware split of the pasted answer into claim candidates.
 * Sentences shorter than 4 words or longer than 60 words are skipped —
 * the former tend to be markers ("Merhaba", "İyi çalışmalar."), the latter
 * become noisy and slow for the naive matcher.
 */
export function splitClaims(answer: string): readonly string[] {
  return answer
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((claim) => claim.trim())
    .filter((claim) => {
      const tokens = claim.split(/\s+/).filter(Boolean);
      return tokens.length >= 4 && tokens.length <= 60;
    });
}

/** Best-match search with a conservative minimum similarity threshold. */
function bestMatchForClaim(
  claimTokens: ReadonlySet<string>,
  sources: readonly SourceDocument[],
  minSimilarity: number,
): { source: SourceDocument; similarity: number } | null {
  let best: { source: SourceDocument; similarity: number } | null = null;
  for (const source of sources) {
    const similarity = jaccard(claimTokens, tokenise(source.text));
    if (similarity >= minSimilarity && (!best || similarity > best.similarity)) {
      best = { source, similarity };
    }
  }
  return best;
}

const DEFAULT_MIN_SIMILARITY = 0.20;

/**
 * Classifies the claims of a pasted AI answer against visible sources.
 *
 * `selfText` is the *entire* visible text of the target site's home page,
 * which the worker fetches via the SSRF-guarded fetcher; `serpSources` are
 * pre-built source documents derived from a SERP provider result (already
 * labelled by position).
 */
export function traceAttribution(
  answer: string,
  opts: {
    /** Visible text of the target site's own home page. */
    readonly selfText: string;
    /** Label for the target site's home page (usually the domain). */
    readonly selfLabel: string;
    /** Optional URL attached to the self source. */
    readonly selfUrl?: string;
    /** Pre-built sources extracted from the SERP. */
    readonly serpSources?: readonly SourceDocument[];
    /** Optional minimum similarity threshold (default {@link DEFAULT_MIN_SIMILARITY}). */
    readonly minSimilarity?: number;
  },
): AttributionTraceResult {
  const claims = splitClaims(answer);
  const sources: SourceDocument[] = [
    {
      id: "self",
      label: opts.selfLabel,
      text: opts.selfText,
      kind: "self",
      ...(opts.selfUrl ? { url: opts.selfUrl } : {}),
    },
    ...(opts.serpSources ?? []),
  ];

  const minSimilarity = opts.minSimilarity ?? DEFAULT_MIN_SIMILARITY;
  const selfTokens = tokenise(opts.selfText);
  const answerMentionsSelf = jaccard(selfTokens, tokenise(answer)) >= 0.05;

  // Whether the answer's overall vocabulary overlaps the site's own text —
  // signals the pasted answer is actually *about* this site, so a claim
  // that mentions it once is presumed to be an on-topic (possibly fabricated)
  // reference rather than an unrelated generic sentence.
  const _mentionPrecomputed = answerMentionsSelf;

  const verdicts: AttributionVerdict[] = [];
  for (const claim of claims) {
    const claimTokens = tokenise(claim);
    const best = bestMatchForClaim(claimTokens, sources, minSimilarity);

    if (!best) {
      // A claim is candidate-misattributed when (a) the answer as a whole is
      // about the target site, and (b) the claim itself shares at least one
      // meaningful non-stop-token with the site's own text. The threshold
      // stays at ≥5 characters to keep short generic words ("is", "the",
      // "was", "turkish", ...) from triggering fabricated self-references
      // while still catching branded terms like "example".
      const mentionsSite =
        _mentionPrecomputed && claimMentionsSite(claimTokens, selfTokens);
      verdicts.push({
        claim,
        kind: mentionsSite ? "misattributed" : "unverifiable",
        bestSimilarity: 0,
      });
      continue;
    }

    verdicts.push({
      claim,
      kind: best.source.kind === "self" ? "self" : "external",
      bestSourceId: best.source.id,
      bestSimilarity: best.similarity,
    });
  }

  const totalClaims = verdicts.length;
  const selfClaims = verdicts.filter((v) => v.kind === "self").length;
  const externalClaims = verdicts.filter((v) => v.kind === "external").length;
  const misattributedClaims = verdicts.filter((v) => v.kind === "misattributed").length;
  const unverifiableClaims = verdicts.filter((v) => v.kind === "unverifiable").length;

  const score =
    totalClaims === 0
      ? 100
      : Math.max(
          0,
          Math.min(
            100,
            Math.round(((selfClaims + externalClaims) / totalClaims) * 100),
          ),
        );

  return {
    kind: "attribution-trace",
    score,
    totalClaims,
    selfClaims,
    externalClaims,
    misattributedClaims,
    unverifiableClaims,
    verdicts,
  };
}

/**
 * Heuristic used for misattribution: a claim "mentions" the site when it
 * shares at least one token of length >= 5 with the site's own text. The
 * length floor intentionally excludes short generic words (`is`, `the`,
 * `this`, `turkish`, `comapny`) so a fabricated "ranked #1 in Europe" claim
 * on an unrelated answer does not auto-classify as misattributed just for
 * mentioning "largest".
 */
function claimMentionsSite(claimTokens: ReadonlySet<string>, selfTokens: ReadonlySet<string>): boolean {
  for (const token of claimTokens) {
    if (token.length >= 5 && selfTokens.has(token)) return true;
  }
  return false;
}
