import { Container, Section, Card, Link } from "@seovista/ui";
import { toolsPage, checkerPage } from "../../src/content/site";
import { pageMetadataFrom } from "../../src/lib/metadata";
import { buildPageGraph } from "../../src/lib/jsonld";
import { JsonLd } from "../../src/components/json-ld";

export const metadata = pageMetadataFrom({
  title: toolsPage.title,
  description: toolsPage.description,
  canonicalPath: toolsPage.canonical.path,
});

export default function ToolsPage(): React.ReactElement {
  const graph = buildPageGraph(toolsPage);

  return (
    <>
      <JsonLd graph={graph} />
      <main id="main">
        <Section padding="lg" className="bg-mineral">
          <Container>
            <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl lg:text-5xl">
              {toolsPage.title}
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-muted">
              {toolsPage.description}
            </p>
          </Container>
        </Section>

        <Section padding="md">
          <Container>
            <p className="max-w-3xl text-lg leading-relaxed text-ink">
              {toolsPage.body}
            </p>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <Card>
                <h2 className="text-xl font-semibold text-ink">{checkerPage.title}</h2>
                <p className="mt-2 text-muted">{checkerPage.description}</p>
                <div className="mt-4">
                  <Link href={checkerPage.canonical.path} variant="cta" underline="hover">
                    View the checker foundation
                  </Link>
                </div>
              </Card>
            </div>
          </Container>
        </Section>
      </main>
    </>
  );
}
