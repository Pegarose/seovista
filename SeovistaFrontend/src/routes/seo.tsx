import { createFileRoute } from "@tanstack/react-router";
import { DisciplineLayout, type Chapter } from "@/components/discipline-layout";
import { canonicalFor } from "@/lib/site-config";

const TITLE = "Search Engine Optimization (SEO) — SeoVista";
const DESC =
  "SeoVista's view of SEO: technical crawlability, indexation, metadata, and structural clarity that compound over time.";

export const Route = createFileRoute("/seo")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: canonicalFor("/seo/") },
      { property: "og:type", content: "article" },
    ],
    links: [{ rel: "canonical", href: canonicalFor("/seo/") }],
  }),
  component: SeoPage,
});

const CHAPTERS: Chapter[] = [
  {
    id: "foundations",
    eyebrow: "Foundations",
    title: "The site has to be honest first.",
    body: (
      <p>
        Before anything else: pages should load, respond with honest status
        codes, and render the same content to a browser and a crawler.
        Canonical URLs, sitemaps, and internal links should agree with what
        the site actually is.
      </p>
    ),
  },
  {
    id: "structure-metadata",
    eyebrow: "Structure",
    title: "One subject. One primary heading.",
    body: (
      <p>
        Each page needs one clear subject, one primary heading, a descriptive
        title, and metadata that reflects what a reader will find. Structured
        data is only useful when it describes something that is actually on
        the page.
      </p>
    ),
  },
  {
    id: "architecture",
    eyebrow: "Architecture",
    title: "Site shape mirrors expertise shape.",
    body: (
      <p>
        Site architecture is a map of what a site claims to know. Cluster
        related content, link between it deliberately, and let the shape of
        the site tell the truth about the shape of the expertise.
      </p>
    ),
  },
  {
    id: "sustainable",
    eyebrow: "Position",
    title: "We do not promise rankings.",
    body: (
      <p>
        We do not promise rankings or timeframes. Compounding visibility is a
        byproduct of consistent, honest publishing on a technically sound
        site.
      </p>
    ),
  },
];

function SeoPage() {
  return (
    <DisciplineLayout
      number="01"
      displayName="SEO"
      accessibleName="Search Engine Optimization"
      lede="The unglamorous work of making a site crawlable, indexable, structured, and worth returning to."
      capabilities={[
        {
          title: "Crawl & indexation health",
          description:
            "Audit logs, status codes, and render parity so search engines can move through the site without ambiguity.",
        },
        {
          title: "Information architecture",
          description:
            "Group subjects by intent, link deliberately, and let the site shape mirror the expertise shape.",
        },
        {
          title: "Semantic markup & metadata",
          description:
            "Honest titles, headings, and structured data that describe what is actually on the page.",
        },
        {
          title: "Editorial infrastructure",
          description:
            "Workflows, style rules, and governance that keep publishing consistent over time.",
        },
      ]}
      supportingNote="Foundation stage of practice. Every recommendation is traceable to a rendered page, a log line, or a public spec — never to a claim we cannot show."
      inquireTo="/contact"
      inquireLabel="Start a conversation"
      visualCaption="Structure before visibility"
      chapters={CHAPTERS}
      siblingKicker="Continue reading"
      siblingLabel="Generative Engine Optimization"
      siblingTo="/geo"
    />
  );
}
