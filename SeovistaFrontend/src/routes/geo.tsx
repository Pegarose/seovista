import { createFileRoute } from "@tanstack/react-router";
import { DisciplineLayout, type Chapter } from "@/components/discipline-layout";
import { canonicalFor } from "@/lib/site-config";

const TITLE = "Generative Engine Optimization (GEO) — SeoVista";
const DESC =
  "GEO is the practice of making a page understandable, attributable, and citable inside generative answer systems. No ethical practitioner can guarantee inclusion.";

export const Route = createFileRoute("/geo")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: canonicalFor("/geo/") },
      { property: "og:type", content: "article" },
    ],
    links: [{ rel: "canonical", href: canonicalFor("/geo/") }],
  }),
  component: GeoPage,
});

const CHAPTERS: Chapter[] = [
  {
    id: "what-geo-means",
    eyebrow: "Definition",
    title: "What GEO means.",
    body: (
      <p>
        Generative answer systems synthesize responses from many sources at
        once. To be useful to them, a page has to communicate its subject,
        scope, evidence, and authorship without ambiguity. GEO is the discipline
        of designing pages, sections, and sites so that this communication
        happens by default.
      </p>
    ),
  },
  {
    id: "geo-vs-seo",
    eyebrow: "Contrast",
    title: "How GEO differs from traditional SEO.",
    body: (
      <p>
        Traditional SEO optimizes a page against ranking signals for a
        keyword-driven results list. GEO optimizes for retrieval and
        attribution inside a synthesized answer, where the reader is often a
        model deciding what to keep, drop, or paraphrase. The two share a
        foundation — clarity, structure, and technical health — but diverge in
        what counts as a win.
      </p>
    ),
  },
  {
    id: "structure-evidence",
    eyebrow: "Craft",
    title: "Structure and evidence carry meaning.",
    body: (
      <p>
        A well-scoped heading, a defensible claim, and a linked primary source
        are more portable through a summarization pipeline than a long
        paragraph of marketing prose. Structure is not decoration; it is the
        contract between a page and any system that reads it.
      </p>
    ),
  },
  {
    id: "honesty",
    eyebrow: "Position",
    title: "A note on honesty.",
    body: (
      <p>
        No ethical provider can guarantee rankings, citations, or inclusion in
        a generative system. The systems change, the training data is opaque,
        and the mechanisms of selection are not public. Practitioners can
        build for better odds; they cannot promise the outcome.
      </p>
    ),
  },
];

function GeoPage() {
  return (
    <DisciplineLayout
      number="02"
      displayName="GEO"
      accessibleName="Generative Engine Optimization"
      lede="We study how content is chosen, quoted, and attributed by generative answer systems — and how to make that process fairer to the source."
      capabilities={[
        {
          title: "Retrieval-ready structure",
          description:
            "Pages built so models can extract subject, scope, and evidence in one pass.",
        },
        {
          title: "Attribution & provenance",
          description:
            "Clear authorship, citations, and source trails that survive summarization.",
        },
        {
          title: "Answer-surface auditing",
          description:
            "Observing how generative systems quote, omit, or paraphrase existing content.",
        },
        {
          title: "Model-facing clarity",
          description:
            "Plain claims, scoped headings, and minimal ambiguity for synthesis pipelines.",
        },
      ]}
      supportingNote="Foundation stage of practice. We publish what we can defend and refuse what we cannot verify. No fabricated benchmarks."
      inquireTo="/contact"
      inquireLabel="Start a conversation"
      visualCaption="Signal within synthesis"
      chapters={CHAPTERS}
      siblingKicker="Continue reading"
      siblingLabel="Search Engine Optimization"
      siblingTo="/seo"
    />
  );
}
