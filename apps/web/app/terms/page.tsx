import { StatusBadge } from "../../src/components/editorial";
import { JsonLd } from "../../src/components/json-ld";
import { termsPage } from "../../src/content/site";
import { buildPageGraph } from "../../src/lib/jsonld";
import { pageMetadataFrom } from "../../src/lib/metadata";

export const metadata = pageMetadataFrom(termsPage);
export default function TermsPage(): React.ReactElement { return <><JsonLd graph={buildPageGraph(termsPage)} /><main id="main"><article><header className="border-b border-hairline"><div className="mx-auto max-w-4xl px-6 py-20"><StatusBadge>Legal · Foundation draft</StatusBadge><h1 className="mt-6 font-serif text-4xl text-ink">Terms.</h1></div></header><section className="mx-auto max-w-3xl px-6 py-16 text-muted-ink"><p>Editorial material on SeoVista is provided for informational purposes. Nothing on this site is a guarantee of search ranking, citation by a generative system, business outcome, or any specific visibility result.</p><p className="mt-6">Content is © SeoVista unless otherwise attributed. Short excerpts may be quoted with attribution and a link to the source page.</p><p className="mt-6">The site is provided on an "as is" basis. We work to keep it accurate and available but do not warrant uninterrupted service.</p><p className="mt-10 text-xs uppercase tracking-widest">This document is a foundation-stage draft pending final legal review.</p></section></article></main></>; }
