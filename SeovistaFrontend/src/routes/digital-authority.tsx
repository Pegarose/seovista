import { createFileRoute } from "@tanstack/react-router";
import { DisciplineLayout, type Chapter } from "@/components/discipline-layout";
import { canonicalFor } from "@/lib/site-config";

const TITLE = "Digital Authority — SeoVista";
const DESC =
  "Authority is earned through attributable expertise, credible references, and consistent topical contribution. Fabricated mentions and link schemes are not part of that path.";

export const Route = createFileRoute("/digital-authority")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: canonicalFor("/digital-authority/") },
      { property: "og:type", content: "article" },
    ],
    links: [{ rel: "canonical", href: canonicalFor("/digital-authority/") }],
  }),
  component: AuthorityPage,
});

const CHAPTERS: Chapter[] = [
  {
    id: "earned-not-bought",
    eyebrow: "Position",
    title: "Earned, not bought.",
    body: (
      <p>
        Purchased placements, private blog networks, and fabricated mentions
        are not authority. They are noise dressed as signal, and both search
        engines and generative systems increasingly discount them.
      </p>
    ),
  },
  {
    id: "attributable",
    eyebrow: "Craft",
    title: "Attributable expertise.",
    body: (
      <p>
        Named authors, transparent affiliations, and honest bios matter.
        Anonymous mass-produced content struggles to be trusted, cited, or
        quoted.
      </p>
    ),
  },
  {
    id: "longitudinal",
    eyebrow: "Time",
    title: "Consistent topical contribution.",
    body: (
      <p>
        Publishing repeatedly on a well-defined subject, over years, builds
        the kind of authority that outlasts algorithm shifts. One viral post
        does not.
      </p>
    ),
  },
  {
    id: "refusals",
    eyebrow: "Refusals",
    title: "What we will not do.",
    body: (
      <p>
        SeoVista does not run link schemes, buy reviews, invent credentials,
        or manufacture engagement. If a tactic requires deceiving a reader or
        a system, we consider it out of scope.
      </p>
    ),
  },
];

function AuthorityPage() {
  return (
    <DisciplineLayout
      number="03"
      displayName="Authority"
      lede="Authority is a reputation, not a metric. It is what other credible people and institutions say about your work when nobody asked them to."
      capabilities={[
        {
          title: "Named authorship systems",
          description:
            "Bylines, bios, and entity links that make expertise attributable to real people.",
        },
        {
          title: "Source & citation hygiene",
          description:
            "Linking to primary sources and keeping references accurate and current.",
        },
        {
          title: "Longitudinal topic strategy",
          description:
            "Repeated, focused contribution that compounds trust across years.",
        },
        {
          title: "Ethical positioning",
          description:
            "Refusing manufactured mentions, purchased links, and inflated credentials.",
        },
      ]}
      supportingNote="Foundation stage of practice. We refuse tactics that require deceiving a reader or a system, even when they work in the short term."
      inquireTo="/contact"
      inquireLabel="Start a conversation"
      visualCaption="Reputation compounds quietly"
      chapters={CHAPTERS}
      siblingKicker="Continue reading"
      siblingLabel="Generative Engine Optimization"
      siblingTo="/geo"
    />
  );
}
