import { Container, Section } from "@seovista/ui";
import { checkerPage, geoReadinessChecker } from "../../../src/content/site";
import { pageMetadataFrom } from "../../../src/lib/metadata";
import { buildPageGraph } from "../../../src/lib/jsonld";
import { JsonLd } from "../../../src/components/json-ld";

export const metadata = pageMetadataFrom(checkerPage);

export default function GeoReadinessCheckerPage(): React.ReactElement {
  const graph = buildPageGraph(checkerPage);

  return (
    <>
      <JsonLd graph={graph} />
      <main id="main">
        <Section padding="lg" className="bg-mineral">
          <Container>
            <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl lg:text-5xl">
              {checkerPage.title}
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-muted">{checkerPage.description}</p>
          </Container>
        </Section>

        <Section padding="md">
          <Container>
            <p className="max-w-3xl text-lg leading-relaxed text-ink">{checkerPage.body}</p>
            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-ink">
              Status:{" "}
              <strong className="text-ink">
                {geoReadinessChecker.isFunctioning ? "Operational" : "Not operational in Sprint 0"}
              </strong>
              . There is no submission, no score, and no generated report.
            </p>
          </Container>
        </Section>
      </main>
    </>
  );
}
