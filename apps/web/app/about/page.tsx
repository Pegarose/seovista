import { Container, Section } from "@seovista/ui";
import { aboutPage } from "../../src/content/site";
import { pageMetadataFrom } from "../../src/lib/metadata";
import { buildAboutPageGraph } from "../../src/lib/jsonld";
import { JsonLd } from "../../src/components/json-ld";

export const metadata = pageMetadataFrom({
  title: aboutPage.title,
  description: aboutPage.description,
  canonicalPath: aboutPage.canonical.path,
});

export default function AboutPage(): React.ReactElement {
  const graph = buildAboutPageGraph(aboutPage);

  return (
    <>
      <JsonLd graph={graph} />
      <main id="main">
        <Section padding="lg" className="bg-mineral">
          <Container>
            <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl lg:text-5xl">
              {aboutPage.title}
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-muted">
              {aboutPage.description}
            </p>
          </Container>
        </Section>

        <Section padding="md">
          <Container>
            <p className="max-w-3xl text-lg leading-relaxed text-ink">
              {aboutPage.body}
            </p>
          </Container>
        </Section>
      </main>
    </>
  );
}
