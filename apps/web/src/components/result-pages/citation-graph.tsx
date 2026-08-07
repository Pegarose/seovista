/**
 * CitationGraph — SSR inline-SVG citation graph for the Attribution Trace
 * result page (completed state).
 *
 * Renders the claim-to-source provenance map as a pure server-rendered SVG:
 * a "Claims" node column on the left, a "Sources" node column on the right,
 * and one edge per sourced verdict whose stroke weight encodes the best-match
 * similarity (thicker = stronger overlap). The spec constraints are honoured
 * verbatim: no 'use client', no d3, no svg-react, no new runtime dependency —
 * this block stays a static inline `<svg>` that a printed lab report can
 * carry without JS.
 *
 * Layout: fixed viewBox 0 0 900 240; rows are 32 px apart (240 / 32 = 7.5,
 * so at most 7 rows fit); claim nodes sit at x=20, source nodes at x=840;
 * nodes are 8 px circles. The self node (the audited domain) is pinned to
 * the top of the sources column; SERP sources follow below it.
 *
 * Node colour contract (from the Task 10 brief — normative over the spec's
 * verdict-kind palette): a claim node is signal when it resolves to a
 * visible source and ember when it does not (no best source, or its best
 * source is beyond the visible row cap); the self source node is signal and
 * every external SERP source node is spectral. Edge stroke is always the
 * hairline token; stroke width is `0.5 + 2 * bestSimilarity`.
 */

import type { AttributionVerdict, SourceDocument } from "@seovista/seo-core";

export interface CitationGraphProps {
  /** Claim verdicts — drives node rows. */
  verdicts: readonly AttributionVerdict[];
  /** SERP source docs (external nodes). */
  serpSources: readonly SourceDocument[];
  /** Target domain — used to name the "self" source node. */
  targetHost: string;
}

/** The spec's summary sentence for the graph, rendered as the figcaption. */
const FIGCAPTION =
  "Where each claim came from, and which sources carried the most weight.";

/** Empty state copy — matches the page's IssueLedger emptyLabel so the
 * fallback reads like the ledger it replaces. */
const EMPTY_LABEL = "No claims were found in the pasted answer.";

const VIEWBOX_WIDTH = 900;
const VIEWBOX_HEIGHT = 240;
const ROW_HEIGHT = 32;
const MAX_ROWS = Math.floor(VIEWBOX_HEIGHT / ROW_HEIGHT); // 7 visible rows
const CLAIM_X = 20;
const SOURCE_X = 840;
const NODE_RADIUS = 4; // 8 px circles
const FIRST_ROW_Y = 16;

/** Centre-y for the i-th row. Rows run 16, 48, … 208 (7 rows in 240 px). */
function rowY(row: number): number {
  return FIRST_ROW_Y + row * ROW_HEIGHT;
}

/** 0..1 similarity into the 0..100 integer used in tooltips. */
function similarityPct(similarity: number): number {
  return Math.round(similarity * 100);
}

/** Fill token for a claim node: signal when an edge is drawn, else ember. */
function claimFill(hasEdge: boolean): string {
  return hasEdge ? "var(--color-signal)" : "var(--color-ember)";
}

/** Fill token for a source node: self is signal, external SERP is spectral. */
function sourceFill(kind: SourceDocument["kind"]): string {
  return kind === "self" ? "var(--color-signal)" : "var(--color-spectral)";
}

export function CitationGraph(props: CitationGraphProps): React.ReactElement {
  const { verdicts, serpSources, targetHost } = props;

  // Fallback: no verdicts means there is nothing to trace — render the same
  // visual the IssueLedger uses for its empty state instead of an empty SVG.
  if (verdicts.length === 0) {
    return <p className="text-sm text-muted-ink">{EMPTY_LABEL}</p>;
  }

  // Honest row capping: the fixed 240 px viewBox fits 7 rows. Anything
  // beyond that is surfaced as a muted "+N more" text row in its column
  // rather than silently clipped or fabricated.
  const visibleVerdicts = verdicts.slice(0, MAX_ROWS);
  const hiddenClaims = verdicts.length - visibleVerdicts.length;
  const visibleSerp = serpSources.slice(0, MAX_ROWS - 1); // self owns row 0
  const hiddenSources = serpSources.length - visibleSerp.length;
  const overflowY = VIEWBOX_HEIGHT - 8;

  // The self node (audited domain) sits at the top of the sources column;
  // visible SERP sources take rows 1..N below it.
  const sourceNodes: Array<{ source: SourceDocument; row: number }> = [
    {
      source: { id: "self", label: targetHost, text: "", kind: "self" },
      row: 0,
    },
    ...visibleSerp.map((source, idx) => ({ source, row: idx + 1 })),
  ];

  // Resolve a verdict's best source into its label + source-row index.
  // Returns null when the verdict has no source or its source is beyond the
  // visible row cap — such verdicts draw no edge and render as ember nodes.
  function resolveSourceRow(
    verdict: AttributionVerdict,
  ): { label: string; row: number } | null {
    const bestId = verdict.bestSourceId;
    if (typeof bestId !== "string" || bestId.length === 0) return null;
    const match = sourceNodes.find(({ source }) => source.id === bestId);
    return match ? { label: match.source.label, row: match.row } : null;
  }

  const edges = visibleVerdicts.flatMap((verdict, idx) => {
    const target = resolveSourceRow(verdict);
    if (!target) return [];
    return [
      <line
        key={`edge-${idx}`}
        x1={CLAIM_X}
        y1={rowY(idx)}
        x2={SOURCE_X}
        y2={rowY(target.row)}
        stroke="var(--color-hairline)"
        strokeWidth={0.5 + 2 * verdict.bestSimilarity}
      >
        <title>{`${verdict.claim} → ${target.label} (${similarityPct(verdict.bestSimilarity)}%)`}</title>
      </line>,
    ];
  });

  return (
    <figure role="img" aria-label="Citation graph">
      <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} className="w-full">
        {/* Column headers — muted, orientation only. */}
        <text x={CLAIM_X} y={10} fontSize={11} fill="var(--color-muted-ink)">
          Claims
        </text>
        <text x={SOURCE_X} y={10} textAnchor="end" fontSize={11} fill="var(--color-muted-ink)">
          Sources
        </text>

        {edges}

        {/* Claim nodes: one per visible verdict row. */}
        {visibleVerdicts.map((verdict, idx) => (
          <circle
            key={`claim-${idx}`}
            cx={CLAIM_X}
            cy={rowY(idx)}
            r={NODE_RADIUS}
            style={{ fill: claimFill(resolveSourceRow(verdict) !== null) }}
          />
        ))}

        {/* Source nodes: self first, then external SERP sources. */}
        {sourceNodes.map(({ source, row }) => (
          <circle
            key={`source-${source.id}`}
            cx={SOURCE_X}
            cy={rowY(row)}
            r={NODE_RADIUS}
            style={{ fill: sourceFill(source.kind) }}
          >
            <title>{source.label}</title>
          </circle>
        ))}

        {/* Honest overflow rows for whichever column ran out of room. */}
        {hiddenClaims > 0 && (
          <text x={CLAIM_X} y={overflowY} fontSize={11} fill="var(--color-muted-ink)">
            {`+${hiddenClaims} more`}
          </text>
        )}
        {hiddenSources > 0 && (
          <text x={SOURCE_X} y={overflowY} textAnchor="end" fontSize={11} fill="var(--color-muted-ink)">
            {`+${hiddenSources} more`}
          </text>
        )}
      </svg>
      <figcaption className="text-sm text-muted-ink">{FIGCAPTION}</figcaption>
    </figure>
  );
}
