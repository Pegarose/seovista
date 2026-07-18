import { StatusBadge } from "../../src/components/editorial";
import { JsonLd } from "../../src/components/json-ld";
import { privacyPage } from "../../src/content/site";
import { buildPageGraph } from "../../src/lib/jsonld";
import { pageMetadataFrom } from "../../src/lib/metadata";

export const metadata = pageMetadataFrom(privacyPage);
export default function PrivacyPage(): React.ReactElement { return <><JsonLd graph={buildPageGraph(privacyPage)} /><main id="main"><article><header className="border-b border-hairline"><div className="mx-auto max-w-4xl px-6 py-20"><StatusBadge>Legal · Foundation draft</StatusBadge><h1 className="mt-6 font-serif text-4xl text-ink">Privacy.</h1></div></header><section className="mx-auto max-w-3xl px-6 py-16 text-muted-ink"><p>In the foundation release, SeoVista does not run analytics scripts, third-party trackers, advertising pixels, or data-collection forms on this site. Contact is by email only.</p><p className="mt-6">If we introduce processing that involves personal data, for example, a mailing list, this page will be revised to describe the lawful basis, retention period, processors involved, and how to exercise data-subject rights before that processing begins.</p><p className="mt-6">For any question about how your information is handled, email us via the <a href="/contact/" className="text-spectral underline underline-offset-4">contact page</a>.</p><p className="mt-10 text-xs uppercase tracking-widest">This document is a foundation-stage draft pending final legal review.</p></section></article></main></>; }
