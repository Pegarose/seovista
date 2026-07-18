import { StatusBadge } from "../../src/components/editorial";
import { JsonLd } from "../../src/components/json-ld";
import { aboutPage } from "../../src/content/site";
import { buildAboutPageGraph } from "../../src/lib/jsonld";
import { pageMetadataFrom } from "../../src/lib/metadata";

export const metadata = pageMetadataFrom(aboutPage);

export default function AboutPage(): React.ReactElement {
  return <><JsonLd graph={buildAboutPageGraph(aboutPage)} /><main id="main"><article><header className="border-b border-hairline"><div className="mx-auto max-w-4xl px-6 py-20"><StatusBadge>About</StatusBadge><h1 className="mt-6 font-serif text-4xl leading-tight text-ink md:text-5xl">An editorial intelligence lab.</h1><p className="mt-6 text-lg leading-relaxed text-muted-ink">SeoVista is a research initiative within the GMedya Group. Our subject is what makes brands understandable, cite-worthy, and durable across search and generative answer systems.</p></div></header><section className="mx-auto max-w-3xl px-6 py-16"><h2 className="font-serif text-2xl text-ink">What we publish</h2><p className="mt-4 text-muted-ink">Editorial explainers, methodology notes, and, over time, original research. We publish when the work is ready, not on a schedule.</p><h2 className="mt-12 font-serif text-2xl text-ink">How we think about claims</h2><p className="mt-4 text-muted-ink">If we cannot source a claim, we do not make it. If a metric would require inventing data, we leave it out. Foundation-stage means many pages describe intent rather than outcomes; we mark those clearly.</p><h2 className="mt-12 font-serif text-2xl text-ink">Contact</h2><p className="mt-4 text-muted-ink">For editorial or collaboration enquiries, visit the <a href="/contact/" className="text-spectral underline underline-offset-4">contact page</a>.</p></section></article></main></>;
}
