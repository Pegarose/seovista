import { Container, Section, Link } from "@/components/ui";
import { homePage } from "../src/content/site";
import { pageMetadataFrom } from "../src/lib/metadata";
import { buildPageGraph } from "../src/lib/jsonld";
import { JsonLd } from "../src/components/json-ld";

export const metadata = pageMetadataFrom({
  title: homePage.title,
  description: homePage.description,
  canonicalPath: homePage.canonical.path,
});

export default function HomePage(): React.ReactElement {
  const graph = buildPageGraph(homePage);

  return (
    <>
      <JsonLd graph={graph} />
      <main id="main">
        <Section padding="xl" className="bg-mineral">
          <Container>
            <h1 className="max-w-4xl text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl lg:text-6xl">
              {homePage.title}
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted sm:text-xl">
              {homePage.description}
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/geo/"
                className="inline-flex rounded-lg bg-spectral-blue px-5 py-3 font-medium text-paper transition-colors hover:bg-spectral-blue/90"
                underline="none"
              >
                Explore GEO
              </Link>
              <Link
                href="/tools/"
                className="inline-flex rounded-lg border border-border-light bg-paper px-5 py-3 font-medium text-ink transition-colors hover:bg-mineral"
                underline="none"
              >
                Free Tools
              </Link>
            </div>
          </Container>
        </Section>

        <Section padding="lg">
          <Container>
            <p className="max-w-3xl text-lg leading-relaxed text-ink">
              {homePage.body}
            </p>
          </Container>
        </Section>
      </main>
    </>
  );
}
