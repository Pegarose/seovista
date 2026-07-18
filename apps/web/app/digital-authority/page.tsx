import { DisciplineLayout, type Chapter } from "../../src/components/discipline-layout";
import { JsonLd } from "../../src/components/json-ld";
import { digitalAuthorityPage } from "../../src/content/site";
import { buildServicePageGraph } from "../../src/lib/jsonld";
import { pageMetadataFrom } from "../../src/lib/metadata";

export const metadata = pageMetadataFrom(digitalAuthorityPage);

const chapters: Chapter[] = [
  { id: "earned-not-bought", eyebrow: "Position", title: "Earned, not bought.", body: <p>Purchased placements, private blog networks, and fabricated mentions are not authority. They are noise dressed as signal, and both search engines and generative systems increasingly discount them.</p> },
  { id: "attributable", eyebrow: "Craft", title: "Attributable expertise.", body: <p>Named authors, transparent affiliations, and honest bios matter. Anonymous mass-produced content struggles to be trusted, cited, or quoted.</p> },
  { id: "longitudinal", eyebrow: "Time", title: "Consistent topical contribution.", body: <p>Publishing repeatedly on a well-defined subject, over years, builds the kind of authority that outlasts algorithm shifts. One viral post does not.</p> },
  { id: "refusals", eyebrow: "Refusals", title: "What we will not do.", body: <p>SeoVista does not run link schemes, buy reviews, invent credentials, or manufacture engagement. If a tactic requires deceiving a reader or a system, we consider it out of scope.</p> },
];

export default function DigitalAuthorityPage(): React.ReactElement {
  const service = { kind: "service" as const, id: "service-digital-authority", slug: "digital-authority", locale: "en" as const, canonical: digitalAuthorityPage.canonical, indexation: digitalAuthorityPage.indexation, provenance: digitalAuthorityPage.provenance, name: "Digital Authority", description: "Authority is a reputation, not a metric. It is what other credible people and institutions say about your work when nobody asked them to.", body: digitalAuthorityPage.body, sources: [], relatedEntities: [] };
  return <><JsonLd graph={buildServicePageGraph(digitalAuthorityPage, service)} /><main id="main"><DisciplineLayout number="03" displayName="Authority" accessibleName="Digital Authority" lede="Authority is a reputation, not a metric. It is what other credible people and institutions say about your work when nobody asked them to." capabilities={[{ title: "Named authorship systems", description: "Bylines, bios, and entity links that make expertise attributable to real people." }, { title: "Source & citation hygiene", description: "Linking to primary sources and keeping references accurate and current." }, { title: "Longitudinal topic strategy", description: "Repeated, focused contribution that compounds trust across years." }, { title: "Ethical positioning", description: "Refusing manufactured mentions, purchased links, and inflated credentials." }]} supportingNote="Foundation stage of practice. We refuse tactics that require deceiving a reader or a system, even when they work in the short term." inquireTo="/contact/" inquireLabel="Start a conversation" visualCaption="Reputation compounds quietly" chapters={chapters} siblingKicker="Continue reading" siblingLabel="Generative Engine Optimization" siblingTo="/geo/" /></main></>;
}
